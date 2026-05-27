import { createContext, useContext, ReactNode } from "react";
import { useAppStore } from "../store/useAppStore";

interface AuthContextValue {
  isAuthenticated: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { currentUser, setCurrentUser } = useAppStore();

  function logout() {
    // Phase 5 : appeler mutation GraphQL logout + invalider cookie
    setCurrentUser(null);
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated: currentUser !== null, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
