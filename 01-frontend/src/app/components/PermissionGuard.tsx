import type { ReactNode } from "react";
import { ShieldOff } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";

interface PermissionGuardProps {
  resource: string;
  action?: "READ" | "WRITE";
  children?: ReactNode;
}

export function PermissionGuard({ resource, action = "READ", children }: PermissionGuardProps) {
  const hasPermission = useAppStore((s) => s.hasPermission);

  if (!hasPermission(resource, action)) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-4 text-center px-4">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
          <ShieldOff className="w-8 h-8 text-red-400" />
        </div>
        <div>
          <h2 className="text-white font-semibold text-lg">Accès refusé</h2>
          <p className="text-gray-400 text-sm mt-1">
            Vous n'avez pas les permissions nécessaires pour accéder à cette page.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
