import {
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

const httpUrl = import.meta.env.VITE_API_URL ?? "/api/graphql";
const wsUrl =
  import.meta.env.VITE_WS_URL ??
  `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/api/graphql`;

// ─── Refresh token (mutualisé) ────────────────────────────────────────────────
// Une seule promesse de refresh en cours à la fois pour éviter les doublons.

let refreshPromise: Promise<string | null> | null = null;

async function fetchNewToken(): Promise<string | null> {
  try {
    const res = await fetch(httpUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        query: `mutation { refreshToken { accessToken } }`,
      }),
    });
    const data = await res.json();
    const token: string | undefined = data?.data?.refreshToken?.accessToken;
    if (token) {
      tokenStore.set(token);
      scheduleProactiveRefresh();
      return token;
    }
  } catch {
    // Refresh échoué — l'utilisateur sera redirigé vers /login par ProtectedOutlet
  }
  tokenStore.set(null);
  return null;
}

function getRefreshToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = fetchNewToken().finally(() => {
      refreshPromise = null;
    });
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

// ─── errorLink — intercepte les 401 et tente un refresh ──────────────────────

const errorLink = onError(({ graphQLErrors, operation, forward }) => {
  const isUnauthenticated = graphQLErrors?.some(
    (e) => e.extensions?.code === "UNAUTHENTICATED"
  );

  if (!isUnauthenticated) return;

  return new Observable((observer) => {
    getRefreshToken().then((token) => {
      if (!token) {
        // Pas de token valide → laisser l'erreur se propager
        graphQLErrors?.forEach((err) => observer.error(err));
        return;
      }

      // Rejouer l'opération avec le nouveau token
      operation.setContext(({ headers = {} }: { headers: Record<string, string> }) => ({
        headers: { ...headers, Authorization: `Bearer ${token}` },
      }));

      const sub = forward(operation).subscribe({
        next: observer.next.bind(observer),
        error: observer.error.bind(observer),
        complete: observer.complete.bind(observer),
      });

      return () => sub.unsubscribe();
    });
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

const httpLink = new HttpLink({ uri: httpUrl });

// ─── wsLink — connexion WebSocket avec token toujours à jour ─────────────────

wsClient = createClient({
  url: wsUrl,
  connectionParams: () => {
    const token = tokenStore.get();
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
  shouldRetry: () => true,
  retryAttempts: 5,
});

const wsLink = new GraphQLWsLink(wsClient);

// ─── Split HTTP / WS ──────────────────────────────────────────────────────────

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
  link: splitLink,
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: { fetchPolicy: "cache-and-network" },
  },
});
