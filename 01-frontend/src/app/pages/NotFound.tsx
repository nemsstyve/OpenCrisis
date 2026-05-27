import { Link, useParams } from "react-router";
import { AlertTriangle } from "lucide-react";

export default function NotFound() {
  const { incidentId } = useParams<{ incidentId: string }>();
  const backTo = incidentId ? `/incidents/${incidentId}/dashboard` : "/incidents";

  return (
    <div className="flex items-center justify-center min-h-screen p-8 dark:bg-[#0f1116]">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-red-500/10 rounded-full mb-6">
          <AlertTriangle className="w-10 h-10 text-red-400" />
        </div>
        <h1 className="text-4xl font-medium text-gray-900 dark:text-white mb-4">404</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-8">Page non trouvée</p>
        <Link
          to={backTo}
          className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm"
        >
          Retour au tableau de bord
        </Link>
      </div>
    </div>
  );
}
