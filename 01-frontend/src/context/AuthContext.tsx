import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useAppStore } from "../store/useAppStore";
import { apolloClient } from "../lib/apolloClient";
import { tokenStore } from "../lib/tokenStore";
import {
  publishIdentityChange,
  subscribeToIdentityChanges,
} from "../lib/sessionSync";
import {
  LOGIN_MUTATION,
  LOGOUT_MUTATION,
  REFRESH_TOKEN_MUTATION,
} from "../graphql/auth";
import { invalidateAuthSession, scheduleProactiveRefresh } from "../lib/apolloClient";
import type { GqlUser } from "../types/generated";

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<GqlUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { currentUser, setCurrentUser, clearSession } = useAppStore();
  const [isLoading, setIsLoading] = useState(true);
  const authGeneration = useRef(0);

  // Restauration de session au démarrage via le cookie refreshToken (HttpOnly)
  useEffect(() => {
    let cancelled = false;
    const generation = authGeneration.current;

    async function restoreSession() {
      try {
        const { data } = await apolloClient.mutate({
          mutation: REFRESH_TOKEN_MUTATION,
          fetchPolicy: "no-cache",
        });
        if (
          !cancelled &&
          generation === authGeneration.current &&
          data?.refreshToken
        ) {
          await apolloClient.clearStore();

          if (
            cancelled ||
            generation !== authGeneration.current
          ) return;

          tokenStore.set(data.refreshToken.accessToken);
          setCurrentUser(data.refreshToken.user as GqlUser);
          scheduleProactiveRefresh();
        }
      } catch {
        // Pas de session valide — l'utilisateur devra se reconnecter
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    restoreSession();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Un changement d'identite dans un autre onglet
  // invalide immediatement la session locale.
  useEffect(() => {
    return subscribeToIdentityChanges(() => {
      authGeneration.current += 1;
      invalidateAuthSession();
      clearSession();

      void apolloClient.clearStore().catch(() => {
        // En cas d'echec du nettoyage, repartir
        // d'un contexte navigateur neuf.
        window.location.replace("/login");
      });
    });
  }, [clearSession]);

  async function login(email: string, password: string): Promise<GqlUser> {
    // Toute authentification invalide les restaurations precedentes.
    const generation = ++authGeneration.current;

    // Ne jamais reutiliser le cache ou le JWT d'une ancienne identite.
    invalidateAuthSession();
    clearSession();
    await apolloClient.clearStore();

    const { data } = await apolloClient.mutate({
      mutation: LOGIN_MUTATION,
      variables: { email, password },
      fetchPolicy: "no-cache",
    });
    if (generation !== authGeneration.current) {
      throw new Error("Connexion annulee : session remplacee");
    }

    if (!data?.login) throw new Error("Réponse invalide du serveur");
    const user = data.login.user as GqlUser;
    tokenStore.set(data.login.accessToken);
    setCurrentUser(user);
    scheduleProactiveRefresh();

    // Les autres onglets doivent oublier
    // l'ancienne identite et ses donnees.
    publishIdentityChange();

    return user;
  }

  async function logout(): Promise<void> {
    // Invalider les authentifications precedentes.
    const generation = ++authGeneration.current;

    // Bloquer l'affichage des anciennes donnees
    // dans les autres onglets des le debut du logout.
    publishIdentityChange();

    try {
      await apolloClient.mutate({
        mutation: LOGOUT_MUTATION,
        fetchPolicy: "no-cache",
      });
    } finally {
      // Une connexion plus recente ne doit jamais
      // etre effacee par cette ancienne deconnexion.
      if (generation === authGeneration.current) {
        invalidateAuthSession();
        clearSession();
        await apolloClient.clearStore();
      }
    }
  }

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: currentUser !== null,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
