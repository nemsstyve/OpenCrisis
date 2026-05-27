import { FileSearch, Download, Upload, Filter, Search } from "lucide-react";

const artifacts = [
  {
    id: 1,
    name: "logs_serveur_DB-01_20260219.log",
    type: "Log File",
    size: "125 MB",
    source: "Serveur DB-01",
    collected: "2026-02-19 14:35",
    uploadedBy: "Pierre Dupont",
    category: "Technique",
  },
  {
    id: 2,
    name: "rapport_diagnostic_raid.pdf",
    type: "Document",
    size: "2.3 MB",
    source: "Équipe technique",
    collected: "2026-02-19 14:55",
    uploadedBy: "Claire Bernard",
    category: "Investigation",
  },
  {
    id: 3,
    name: "communique_presse_incident.docx",
    type: "Document",
    size: "450 KB",
    source: "Service communication",
    collected: "2026-02-19 15:00",
    uploadedBy: "Sophie Laurent",
    category: "Communication",
  },
  {
    id: 4,
    name: "photos_materiel_defaillant.zip",
    type: "Images",
    size: "15 MB",
    source: "Site technique",
    collected: "2026-02-19 14:45",
    uploadedBy: "Thomas Petit",
    category: "Technique",
  },
  {
    id: 5,
    name: "notification_anssi_brouillon.pdf",
    type: "Document",
    size: "890 KB",
    source: "Service juridique",
    collected: "2026-02-19 14:50",
    uploadedBy: "Isabelle Moreau",
    category: "Réglementaire",
  },
  {
    id: 6,
    name: "monitoring_infrastructure_secours.csv",
    type: "Data",
    size: "3.2 MB",
    source: "Système monitoring",
    collected: "2026-02-19 15:05",
    uploadedBy: "Jean Martin",
    category: "Technique",
  },
];

const typeColors: Record<string, string> = {
  "Log File": "bg-yellow-500/10 text-yellow-400",
  "Document": "bg-blue-500/10 text-blue-400",
  "Images": "bg-purple-500/10 text-purple-400",
  "Data": "bg-green-500/10 text-green-400",
};

const categoryColors: Record<string, string> = {
  Technique: "bg-blue-500/10 text-blue-400",
  Investigation: "bg-purple-500/10 text-purple-400",
  Communication: "bg-green-500/10 text-green-400",
  Réglementaire: "bg-orange-500/10 text-orange-400",
};

export default function Artifacts() {
  return (
    <div className="p-8 bg-[#0f1116] dark:bg-[#0f1116] bg-gray-50 min-h-screen">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl mb-2 text-gray-900 dark:text-white">Artefacts</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Documents, preuves et fichiers collectés durant la crise
          </p>
        </div>
        <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors">
          <Upload className="w-5 h-5" />
          Téléverser un artefact
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-[#13151a] dark:bg-[#13151a] bg-white border border-[#1e2229] dark:border-[#1e2229] border-gray-200 rounded-lg p-6">
          <h3 className="text-gray-600 dark:text-gray-400 text-sm mb-2">Total artefacts</h3>
          <p className="text-3xl text-gray-900 dark:text-white">{artifacts.length}</p>
        </div>
        <div className="bg-[#13151a] dark:bg-[#13151a] bg-white border border-[#1e2229] dark:border-[#1e2229] border-gray-200 rounded-lg p-6">
          <h3 className="text-gray-600 dark:text-gray-400 text-sm mb-2">Documents</h3>
          <p className="text-3xl text-blue-400">
            {artifacts.filter((a) => a.type === "Document").length}
          </p>
        </div>
        <div className="bg-[#13151a] dark:bg-[#13151a] bg-white border border-[#1e2229] dark:border-[#1e2229] border-gray-200 rounded-lg p-6">
          <h3 className="text-gray-600 dark:text-gray-400 text-sm mb-2">Logs & Data</h3>
          <p className="text-3xl text-yellow-400">
            {artifacts.filter((a) => a.type === "Log File" || a.type === "Data").length}
          </p>
        </div>
        <div className="bg-[#13151a] dark:bg-[#13151a] bg-white border border-[#1e2229] dark:border-[#1e2229] border-gray-200 rounded-lg p-6">
          <h3 className="text-gray-600 dark:text-gray-400 text-sm mb-2">Taille totale</h3>
          <p className="text-3xl text-gray-900 dark:text-white">146 MB</p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher un artefact..."
            className="w-full bg-[#13151a] dark:bg-[#13151a] bg-white border border-[#1e2229] dark:border-[#1e2229] border-gray-200 rounded-lg pl-10 pr-4 py-2 text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        <button className="flex items-center gap-2 bg-[#13151a] dark:bg-[#13151a] bg-gray-200 border border-[#1e2229] dark:border-[#1e2229] border-gray-200 px-4 py-2 rounded-lg hover:bg-[#1a1d24] dark:hover:bg-[#1a1d24] hover:bg-gray-300 text-gray-900 dark:text-white transition-colors">
          <Filter className="w-5 h-5" />
          Filtres
        </button>
      </div>

      {/* Artifacts List */}
      <div className="space-y-4">
        {artifacts.map((artifact) => (
          <div
            key={artifact.id}
            className="bg-[#13151a] dark:bg-[#13151a] bg-white border border-[#1e2229] dark:border-[#1e2229] border-gray-200 rounded-lg p-6 hover:border-[#2a2e39] dark:hover:border-[#2a2e39] hover:border-gray-300 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <FileSearch className="w-5 h-5 text-blue-400" />
                  <h3 className="text-lg font-mono text-gray-900 dark:text-white">{artifact.name}</h3>
                </div>
                <div className="flex items-center gap-3 mb-3">
                  <span
                    className={`px-2 py-1 text-xs rounded ${
                      typeColors[artifact.type]
                    }`}
                  >
                    {artifact.type}
                  </span>
                  <span
                    className={`px-2 py-1 text-xs rounded ${
                      categoryColors[artifact.category]
                    }`}
                  >
                    {artifact.category}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-500 text-gray-400">
                    {artifact.size}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-500 text-gray-400">
                    Source: {artifact.source}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500 dark:text-gray-500 text-gray-400">Collecté: </span>
                    <span className="text-gray-700 dark:text-gray-300">{artifact.collected}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-500 text-gray-400">Par: </span>
                    <span className="text-gray-700 dark:text-gray-300">{artifact.uploadedBy}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="p-2 bg-[#1e2229] dark:bg-[#1e2229] bg-gray-200 hover:bg-[#2a2e39] dark:hover:bg-[#2a2e39] hover:bg-gray-300 text-gray-900 dark:text-white rounded-lg transition-colors" title="Télécharger">
                  <Download className="w-5 h-5" />
                </button>
                <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors">
                  Voir détails
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
