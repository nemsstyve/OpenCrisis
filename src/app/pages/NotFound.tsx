import { Link } from "react-router";
import { AlertTriangle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex items-center justify-center h-screen p-8">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-red-500/10 rounded-full mb-6">
          <AlertTriangle className="w-10 h-10 text-red-400" />
        </div>
        <h1 className="text-4xl mb-4">404</h1>
        <p className="text-xl text-gray-400 mb-8">Page non trouvée</p>
        <Link
          to="/"
          className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
        >
          Retour au tableau de bord
        </Link>
      </div>
    </div>
  );
}
