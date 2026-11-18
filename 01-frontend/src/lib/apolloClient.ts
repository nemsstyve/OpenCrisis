import {
  ApolloLink,
  ApolloClient,
  InMemoryCache,
  split,
  HttpLink,
  from,
  Observable,
} from "@apollo/client";
import { onError } from "@apollo/client/link/error";
import { setContext } from "@apollo/client/link/context";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { getMainDefinition } from "@apollo/client/utilities";
import { createClient } from "graphql-ws";
import { tokenStore } from "./tokenStore";
import {
  serializeCookieOperation,
  serializedAuthFetch,
} from "./cookieMutationQueue";

const httpUrl = import.meta.env.VITE_API_URL ?? "/api/graphql";
const wsUrl =
  import.meta.env.VITE_WS_URL ??
  `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/api/graphql`;

// ─── Refresh token (mutualisé) ────────────────────────────────────────────────
// Une seule promesse de refresh en cours à la fois pour éviter les doublons.

let refreshPromise: Promise<string | null> | null = null;
let sessionEpoch = 0;

async function fetchNewToken(): Promise<string | null> {
  const epoch = sessionEpoch;
  try {
    const res = await serializeCookieOperation(() => {
      // Verifier la session APRES l'attente dans
      // la file, juste avant l'envoi HTTP.
      if (epoch !== sessionEpoch) {
        return Promise.resolve(null);
      }

      return fetch(httpUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        query: `mutation { refreshToken { accessToken } }`,
      }),
      });
    });

    // La session a change pendant l'attente :
    // aucun appel HTTP n'a ete effectue.
    if (res === null) return null;

    const data = await res.json();

    // Ignorer toute reponse appartenant a une session invalidee.
    if (epoch !== sessionEpoch) return null;

    const token: string | undefined = data?.data?.refreshToken?.accessToken;
    if (token) {
      tokenStore.set(token);
      scheduleProactiveRefresh();
      return token;
    }
  } catch {
    // Refresh échoué — l'utilisateur sera redirigé vers /login par ProtectedOutlet
  }
  if (epoch === sessionEpoch) {
    tokenStore.set(null);
  }
  return null;
}

function getRefreshToken(): Promise<string | null> {
  if (!refreshPromise) {
    const pending = fetchNewToken().finally(() => {
      if (refreshPromise === pending) {
        refreshPromise = null;
      }
    });
    refreshPromise = pending;
  }
  return refreshPromise;
}

// ─── Refresh proactif (I1 — renouvelle 1 min avant expiration) ───────────────
// Le token expire dans 15 min — on le renouvelle à 14 min.

const PROACTIVE_REFRESH_MS = 14 * 60 * 1000;
let proactiveTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleProactiveRefresh() {
  if (proactiveTimer) clearTimeout(proactiveTimer);
  proactiveTimer = setTimeout(() => {
    if (tokenStore.get()) {
      getRefreshToken().then((token) => {
        if (token) reconnectWebSocket();
      });
    }
  }, PROACTIVE_REFRESH_MS);
}

// ─── Reconnexion WebSocket après refresh ──────────────────────────────────────

let wsClient: ReturnType<typeof createClient> | null = null;

export function reconnectWebSocket() {
  wsClient?.terminate();
}

/**
 * Invalide les requetes de refresh de l'ancienne session.
 * Annule le timer et coupe la connexion WebSocket courante.
 */
export function invalidateAuthSession() {
  sessionEpoch += 1;

  // Detacher l'ancienne promesse sans autoriser
  // son resultat a modifier la nouvelle session.
  refreshPromise = null;

  if (proactiveTimer) {
    clearTimeout(proactiveTimer);
    proactiveTimer = null;
  }

  tokenStore.set(null);
  reconnectWebSocket();
}

// ─── errorLink — intercepte les 401 et tente un refresh ──────────────────────

const errorLink = onError(({ graphQLErrors, operation, forward }) => {
  const isUnauthenticated = graphQLErrors?.some(
    (error) => error.extensions?.code === "UNAUTHENTICATED",
  );

  if (!isUnauthenticated) return;

  // Capturer la session au moment du 401.
  // Une nouvelle identite ne doit pas reprendre
  // une operation appartenant a l'ancienne.
  const requestEpoch = sessionEpoch;

  return new Observable((observer) => {
    let cancelled = false;
    let retrySubscription: { unsubscribe(): void } | null = null;

    void getRefreshToken()
      .then((token) => {
        // Une requete abandonnee ne doit jamais etre relancee.
        if (cancelled || observer.closed) return;

        // Interdire le rejeu apres changement de session.
        if (requestEpoch !== sessionEpoch) return;

        // Le token recu doit encore etre celui de la
        // session courante au moment du rejeu.
        if (!token || tokenStore.get() !== token) {
          observer.error(
            graphQLErrors?.find(
              (error) =>
                error.extensions?.code === "UNAUTHENTICATED",
            ) ?? new Error("Session non authentifiee"),
          );
          return;
        }

        operation.setContext(
          ({ headers = {} }: { headers: Record<string, string> }) => ({
            headers: {
              ...headers,
              Authorization: `Bearer ${token}`,
            },
          }),
        );

        // Le callback de nettoyage doit rester disponible
        // apres le demarrage de la requete de remplacement.
        retrySubscription = forward(operation).subscribe({
          next: (value) => {
            if (
              !cancelled &&
              requestEpoch === sessionEpoch &&
              !observer.closed
            ) {
              observer.next(value);
            }
          },
          error: (error) => {
            if (!cancelled && !observer.closed) {
              observer.error(error);
            }
          },
          complete: () => {
            if (!cancelled && !observer.closed) {
              observer.complete();
            }
          },
        });
      })
      .catch((error) => {
        if (!cancelled && !observer.closed) {
          observer.error(error);
        }
      });

    // Apollo appelle cette fonction des que le
    // consommateur annule son abonnement.
    return () => {
      cancelled = true;
      retrySubscription?.unsubscribe();
    };
  });
});

// ─── authLink — injecte le JWT dans chaque requête HTTP ──────────────────────

const authLink = setContext((_, { headers }) => {
  const token = tokenStore.get();
  return {
    headers: {
      ...headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
});

const httpLink = new HttpLink({
  uri: httpUrl,
  credentials: "include",
  fetch: serializedAuthFetch,
});

// ─── wsLink — connexion WebSocket avec token toujours à jour ─────────────────

wsClient = createClient({
  url: wsUrl,
  connectionParams: () => {
    const token = tokenStore.get();
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
  shouldRetry: () => Boolean(tokenStore.get()),
  retryAttempts: 5,
});

const wsLink = new GraphQLWsLink(wsClient);

// ─── Split HTTP / WS ──────────────────────────────────────────────────────────

/**
 * Bloque les reponses GraphQL d'une ancienne session.
 *
 * Le controle se situe en amont du transport et
 * du cache Apollo, pour HTTP comme pour WebSocket.
 *
 * Aucun verrou entre entreprises n'est utilise.
 */
const sessionGuardLink = new ApolloLink(
  (operation, forward) =>
    new Observable((observer) => {
      const requestEpoch = sessionEpoch;

      const isCurrentSession = () =>
        requestEpoch === sessionEpoch;

      const subscription = forward(operation).subscribe({
        next: (result) => {
          if (!isCurrentSession()) {
            observer.complete();
            return;
          }

          observer.next(result);
        },
        error: (error) => {
          if (!isCurrentSession()) {
            observer.complete();
            return;
          }

          observer.error(error);
        },
        complete: () => {
          observer.complete();
        },
      });

      return () => subscription.unsubscribe();
    }),
);

const splitLink = split(
  ({ query }) => {
    const definition = getMainDefinition(query);
    return (
      definition.kind === "OperationDefinition" &&
      definition.operation === "subscription"
    );
  },
  wsLink,
  from([errorLink, authLink, httpLink])
);

export const apolloClient = new ApolloClient({
  link: from([sessionGuardLink, splitLink]),
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: { fetchPolicy: "cache-and-network" },
  },
});
