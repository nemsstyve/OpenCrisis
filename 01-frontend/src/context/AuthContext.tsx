import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { useAppStore } from "../store/useAppStore";
import { apolloClient } from "../lib/apolloClient";
import { tokenStore } from "../lib/tokenStore";
import {
  LOGIN_MUTATION,
  LOGOUT_MUTATION,
  REFRESH_TOKEN_MUTATION,
} from "../graphql/auth";
import { scheduleProactiveRefresh } from "../lib/apolloClient";
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

  // Restauration de session au démarrage via le cookie refreshToken (HttpOnly)
  useEffect(() => {
    let cancelled = false;
    async function restoreSession() {
      try {
        const { data } = await apolloClient.mutate({
          mutation: REFRESH_TOKEN_MUTATION,
          fetchPolicy: "no-cache",
        });
        if (!cancelled && data?.refreshToken) {
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

  async function login(email: string, password: string): Promise<GqlUser> {
    const { data } = await apolloClient.mutate({
      mutation: LOGIN_MUTATION,
      variables: { email, password },
      fetchPolicy: "no-cache",
    });
    if (!data?.login) throw new Error("Réponse invalide du serveur");
    const user = data.login.user as GqlUser;
    tokenStore.set(data.login.accessToken);
    setCurrentUser(user);
    scheduleProactiveRefresh();
    return user;
  }

  async function logout(): Promise<void> {
    try {
      await apolloClient.mutate({
        mutation: LOGOUT_MUTATION,
        fetchPolicy: "no-cache",
      });
    } finally {
      tokenStore.set(null);
      clearSession();
      await apolloClient.clearStore();
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
