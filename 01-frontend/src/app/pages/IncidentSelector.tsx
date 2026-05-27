import { useNavigate } from "react-router";
import { AlertTriangle, Plus } from "lucide-react";

// Phase 5 : remplacer par query GraphQL incidents
const MOCK_INCIDENTS = [
  {
    id: "demo",
    name: "Incident de démonstration",
    description: "Environnement de test et développement",
    status: "ACTIVE" as const,
    severity: "MEDIUM" as const,
    startedAt: new Date().toISOString(),
  },
];

const SEVERITY_COLORS = {
  LOW: "text-green-400 bg-green-400/10",
  MEDIUM: "text-yellow-400 bg-yellow-400/10",
  HIGH: "text-orange-400 bg-orange-400/10",
  CRITICAL: "text-red-400 bg-red-400/10",
};

const STATUS_LABELS = {
  ACTIVE: "En cours",
  CONTAINED: "Contenu",
  CLOSED: "Clos",
};

export default function IncidentSelector() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#0f1116] flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="mb-8">
          <h1 className="text-2xl text-white font-medium">Open Crisis</h1>
          <p className="text-gray-400 mt-1">Sélectionnez un incident pour commencer</p>
        </div>

        <div className="space-y-3">
          {MOCK_INCIDENTS.map((incident) => (
            <button
              key={incident.id}
              onClick={() => navigate(`/incidents/${incident.id}/dashboard`)}
              className="w-full text-left bg-[#13151a] border border-[#1e2229] hover:border-blue-500/50 rounded-lg p-5 transition-colors group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-white font-medium group-hover:text-blue-400 transition-colors">
                      {incident.name}
                    </p>
                    {incident.description && (
                      <p className="text-gray-500 text-sm mt-0.5">{incident.description}</p>
                    )}
                    <p className="text-gray-600 text-xs mt-2">
                      Ouvert le {new Date(incident.startedAt).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SEVERITY_COLORS[incident.severity]}`}>
                    {incident.severity}
                  </span>
                  <span className="text-xs text-gray-500">
                    {STATUS_LABELS[incident.status]}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>

        <button className="mt-4 w-full flex items-center justify-center gap-2 border border-dashed border-[#1e2229] hover:border-blue-500/50 rounded-lg p-4 text-gray-500 hover:text-blue-400 transition-colors text-sm">
          <Plus className="w-4 h-4" />
          Déclarer un nouvel incident
        </button>
      </div>
    </div>
  );
}
