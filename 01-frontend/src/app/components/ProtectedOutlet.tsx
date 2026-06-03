import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "../../context/AuthContext";
import { useAppStore } from "../../store/useAppStore";

/**
 * Route parente protégée : redirige vers /login si non authentifié,
 * ou vers /change-password si le changement de mot de passe est requis.
 */
export default function ProtectedOutlet() {
  const { isAuthenticated, isLoading } = useAuth();
  const currentUser = useAppStore((s) => s.currentUser);
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0f1116] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Restauration de la session…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  // C3 — forcer le changement de mot de passe avant tout accès
  if (currentUser?.mustChangePassword && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }

  return <Outlet />;
}
