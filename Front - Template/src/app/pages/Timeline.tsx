import { ChevronDown, X } from "lucide-react";
import { useState } from "react";

interface TimelineEvent {
  id: number;
  timestamp: string;
  description: string;
  user: string;
  evenement: string;
  asset: string;
  ipAddress: string;
  commentaire: string;
  artifacts: string[];
}

const mockEvents: TimelineEvent[] = [
  {
    id: 1,
    timestamp: "2026-02-19 15:05",
    description: "Coordination avec les équipes terrain - Tous les services critiques fonctionnent normalement sur l'infrastructure de secours",
    user: "Thomas Petit",
    evenement: "Coordination",
    asset: "Infrastructure-Secours",
    ipAddress: "10.0.2.0/24",
    commentaire: "Basculement réussi",
    artifacts: ["Rapport-Infrastructure-Secours.pdf"],
  },
  {
    id: 2,
    timestamp: "2026-02-19 14:50",
    description: "Remplacement du matériel défaillant - Équipe technique sur site. Diagnostic confirmé : panne du contrôleur RAID",
    user: "Claire Bernard",
    evenement: "Maintenance",
    asset: "Serveur-DB-01",
    ipAddress: "10.0.1.15",
    commentaire: "Contrôleur RAID défaillant - Remplacement en cours (ETA: 2h)",
    artifacts: ["Diagnostic-RAID-Controller.pdf", "Photo-Serveur-DB01.jpg"],
  },
  {
    id: 3,
    timestamp: "2026-02-19 14:35",
    description: "Analyse des logs serveur - Suspicion d'une défaillance matérielle sur le système de stockage RAID",
    user: "Pierre Dupont",
    evenement: "Investigation",
    asset: "Serveur-DB-01",
    ipAddress: "10.0.1.15",
    commentaire: "Analyse préliminaire indique problème matériel",
    artifacts: ["Logs-Serveur-DB01.log", "Analyse-Preliminaire.txt"],
  },
  {
    id: 4,
    timestamp: "2026-02-19 14:25",
    description: "Détection de panne serveur principal - Basculement automatique sur le serveur de secours DB-02 effectué",
    user: "Jean Martin",
    evenement: "Incident",
    asset: "Serveur-DB-01",
    ipAddress: "10.0.1.15",
    commentaire: "Basculement automatique activé",
    artifacts: ["Alerte-Monitoring.txt", "Logs-Basculement.log"],
  },
];

export default function Timeline() {
  const [events, setEvents] = useState<TimelineEvent[]>(mockEvents);
  const [filters, setFilters] = useState<Record<string, string>>({
    timestamp: "",
    description: "",
    user: "",
    evenement: "",
    asset: "",
    ipAddress: "",
    commentaire: "",
  });
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());

  const toggleFilter = (column: string) => {
    const newActiveFilters = new Set(activeFilters);
    if (newActiveFilters.has(column)) {
      newActiveFilters.delete(column);
      setFilters((prev) => ({ ...prev, [column]: "" }));
    } else {
      newActiveFilters.add(column);
    }
    setActiveFilters(newActiveFilters);
  };

  const clearFilter = (column: string) => {
    const newActiveFilters = new Set(activeFilters);
    newActiveFilters.delete(column);
    setActiveFilters(newActiveFilters);
    setFilters((prev) => ({ ...prev, [column]: "" }));
  };

  const updateFilter = (column: string, value: string) => {
    setFilters((prev) => ({ ...prev, [column]: value }));
  };

  const filteredEvents = events.filter((event) => {
    return Object.entries(filters).every(([key, value]) => {
      if (!value) return true;
      const eventValue = event[key as keyof TimelineEvent];
      if (typeof eventValue === "string") {
        return eventValue.toLowerCase().includes(value.toLowerCase());
      }
      return true;
    });
  });

  const activeFilterCount = Object.values(filters).filter(
    (v) => v !== ""
  ).length;

  return (
    <div className="p-8 bg-[#0f1116] dark:bg-[#0f1116] bg-gray-50 min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl mb-2 text-gray-900 dark:text-white">
          Timeline - Cellule opérationnelle
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Chronologie détaillée des événements opérationnels
        </p>
      </div>

      {/* Active Filters Display */}
      {activeFilterCount > 0 && (
        <div className="mb-6 bg-[#13151a] dark:bg-[#13151a] bg-white border border-[#1e2229] dark:border-[#1e2229] border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Filtres actifs:
            </span>
            {Object.entries(filters)
              .filter(([, value]) => value !== "")
              .map(([key, value]) => (
                <span
                  key={key}
                  className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/10 text-blue-400 text-sm rounded-lg"
                >
                  <span className="capitalize">{key}:</span>
                  <span className="font-medium">{value}</span>
                  <button
                    onClick={() => clearFilter(key)}
                    className="hover:bg-blue-500/20 rounded p-0.5 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-[#13151a] dark:bg-[#13151a] bg-white border border-[#1e2229] dark:border-[#1e2229] border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#0a0b0d] dark:bg-[#0a0b0d] bg-gray-100 border-b border-[#1e2229] dark:border-[#1e2229] border-gray-200">
              <tr>
                {[
                  { key: "timestamp", label: "Timestamp", width: "w-40" },
                  { key: "description", label: "Description", width: "" },
                  { key: "user", label: "Utilisateur", width: "w-36" },
                  { key: "evenement", label: "Événement", width: "w-32" },
                  { key: "asset", label: "Asset", width: "w-36" },
                  { key: "ipAddress", label: "Adresse IP", width: "w-32" },
                  { key: "commentaire", label: "Commentaire", width: "w-48" },
                  { key: "artifacts", label: "Artefacts", width: "w-40" },
                ].map((column) => (
                  <th
                    key={column.key}
                    className={`px-4 py-3 text-left ${column.width}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                        {column.label}
                      </span>
                      {column.key !== "artifacts" && (
                        <button
                          onClick={() => toggleFilter(column.key)}
                          className={`p-1 rounded transition-colors ${
                            activeFilters.has(column.key)
                              ? "bg-blue-500/20 text-blue-400"
                              : "hover:bg-[#1e2229] dark:hover:bg-[#1e2229] hover:bg-gray-200 text-gray-600 dark:text-gray-500"
                          }`}
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {activeFilters.has(column.key) && (
                      <input
                        type="text"
                        value={filters[column.key] || ""}
                        onChange={(e) =>
                          updateFilter(column.key, e.target.value)
                        }
                        placeholder={`Filtrer ${column.label.toLowerCase()}...`}
                        className="mt-2 w-full px-2 py-1 bg-[#13151a] dark:bg-[#13151a] bg-white border border-[#1e2229] dark:border-[#1e2229] border-gray-300 rounded text-sm text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                      />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2229] dark:divide-[#1e2229] divide-gray-200">
              {filteredEvents.length > 0 ? (
                filteredEvents.map((event) => (
                  <tr
                    key={event.id}
                    className="hover:bg-[#1a1d24] dark:hover:bg-[#1a1d24] hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 dark:text-white">
                        {event.timestamp}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        {event.description}
                      </p>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className="text-sm text-blue-400 dark:text-blue-400 text-blue-600">
                        {event.user}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs rounded bg-purple-500/10 text-purple-400">
                        {event.evenement}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900 dark:text-white">
                        {event.asset}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className="text-sm font-mono text-green-400">
                        {event.ipAddress}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {event.commentaire}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-1">
                        {event.artifacts.map((artifact, index) => (
                          <a
                            key={index}
                            href="#"
                            className="text-sm text-blue-400 hover:text-blue-300 hover:underline truncate"
                          >
                            {artifact}
                          </a>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-gray-600 dark:text-gray-400"
                  >
                    Aucun événement trouvé
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
