import { Save, Download, Upload, Plus, Clock, Tag, Filter } from "lucide-react";
import { useState } from "react";

interface Entry {
  id: number;
  timestamp: string;
  author: string;
  content: string;
  tags: string[];
}

const mockEntries: Entry[] = [
  {
    id: 1,
    timestamp: "2026-02-19 14:30",
    author: "Marie Dubois",
    content: "Activation de la cellule de crise suite à la panne majeure de l'infrastructure IT. Convocation d'urgence de tous les responsables.",
    tags: ["Décision", "Événements"],
  },
  {
    id: 2,
    timestamp: "2026-02-19 14:45",
    author: "Isabelle Moreau",
    content: "Point juridique : Obligation de notification ANSSI dans les 72h. Préparation des documents nécessaires en cours.",
    tags: ["Traçabilité"],
  },
  {
    id: 3,
    timestamp: "2026-02-19 15:00",
    author: "Sophie Laurent",
    content: "Communication externe : Préparation du communiqué de presse. Validation par la direction prévue dans 1h.",
    tags: ["Décision"],
  },
];

const availableTags = ["Décision", "Traçabilité", "Événements"];

const tagColors: Record<string, string> = {
  Décision: "bg-purple-500/10 text-purple-400",
  Traçabilité: "bg-green-500/10 text-green-400",
  Événements: "bg-orange-500/10 text-orange-400",
};

export default function MainCouranteDirection() {
  const [entries, setEntries] = useState<Entry[]>(mockEntries);
  const [newEntry, setNewEntry] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [filterTag, setFilterTag] = useState<string>("all");

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleAddEntry = () => {
    if (newEntry.trim()) {
      const entry: Entry = {
        id: entries.length + 1,
        timestamp: new Date().toLocaleString("fr-FR", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }),
        author: "Utilisateur actuel",
        content: newEntry,
        tags: selectedTags,
      };
      setEntries([entry, ...entries]);
      setNewEntry("");
      setSelectedTags([]);
    }
  };

  const filteredEntries =
    filterTag === "all"
      ? entries
      : entries.filter((entry) => entry.tags.includes(filterTag));

  return (
    <div className="p-8 bg-[#0f1116] dark:bg-[#0f1116] bg-gray-50 min-h-screen">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl mb-2 text-gray-900 dark:text-white">Main courante - Cellule de Direction</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Journal des décisions stratégiques et communications
          </p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 bg-[#1e2229] dark:bg-[#1e2229] bg-gray-200 hover:bg-[#2a2e39] dark:hover:bg-[#2a2e39] hover:bg-gray-300 text-gray-900 dark:text-white px-4 py-2 rounded-lg transition-colors">
            <Upload className="w-4 h-4" />
            Importer
          </button>
          <button className="flex items-center gap-2 bg-[#1e2229] dark:bg-[#1e2229] bg-gray-200 hover:bg-[#2a2e39] dark:hover:bg-[#2a2e39] hover:bg-gray-300 text-gray-900 dark:text-white px-4 py-2 rounded-lg transition-colors">
            <Download className="w-4 h-4" />
            Exporter
          </button>
          <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors">
            <Save className="w-4 h-4" />
            Sauvegarder
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-[#13151a] dark:bg-[#13151a] bg-white border border-[#1e2229] dark:border-[#1e2229] border-gray-200 rounded-lg p-6">
          <h3 className="text-gray-600 dark:text-gray-400 text-sm mb-2">Entrées totales</h3>
          <p className="text-3xl text-gray-900 dark:text-white">{entries.length}</p>
        </div>
        <div className="bg-[#13151a] dark:bg-[#13151a] bg-white border border-[#1e2229] dark:border-[#1e2229] border-gray-200 rounded-lg p-6">
          <h3 className="text-gray-600 dark:text-gray-400 text-sm mb-2">Dernière mise à jour</h3>
          <p className="text-xl text-gray-900 dark:text-white">{entries[0]?.timestamp || "—"}</p>
        </div>
        <div className="bg-[#13151a] dark:bg-[#13151a] bg-white border border-[#1e2229] dark:border-[#1e2229] border-gray-200 rounded-lg p-6">
          <h3 className="text-gray-600 dark:text-gray-400 text-sm mb-2">Contributeurs</h3>
          <p className="text-3xl text-gray-900 dark:text-white">
            {new Set(entries.map((e) => e.author)).size}
          </p>
        </div>
      </div>

      {/* New Entry Form */}
      <div className="bg-[#13151a] dark:bg-[#13151a] bg-white border border-[#1e2229] dark:border-[#1e2229] border-gray-200 rounded-lg p-6 mb-6">
        <h2 className="text-xl mb-4 text-gray-900 dark:text-white">Nouvelle entrée</h2>
        <div className="mb-4">
          <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">Tags</label>
          <div className="flex gap-2 flex-wrap">
            {availableTags.map((tag) => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  selectedTags.includes(tag)
                    ? tagColors[tag]
                    : "bg-[#0a0b0d] dark:bg-[#0a0b0d] bg-gray-100 text-gray-600 dark:text-gray-400 hover:bg-[#1e2229] dark:hover:bg-[#1e2229] hover:bg-gray-200"
                }`}
              >
                <Tag className="w-3 h-3 inline-block mr-1" />
                {tag}
              </button>
            ))}
          </div>
        </div>
        <textarea
          value={newEntry}
          onChange={(e) => setNewEntry(e.target.value)}
          placeholder="Saisir une nouvelle entrée dans la main courante..."
          className="w-full h-32 bg-[#0a0b0d] dark:bg-[#0a0b0d] bg-gray-50 border border-[#1e2229] dark:border-[#1e2229] border-gray-300 rounded-lg p-4 text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors resize-none"
        />
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleAddEntry}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!newEntry.trim()}
          >
            <Plus className="w-4 h-4" />
            Ajouter l'entrée
          </button>
        </div>
      </div>

      {/* Entries Timeline */}
      <div className="bg-[#13151a] dark:bg-[#13151a] bg-white border border-[#1e2229] dark:border-[#1e2229] border-gray-200 rounded-lg">
        <div className="p-6 border-b border-[#1e2229] dark:border-[#1e2229] border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl text-gray-900 dark:text-white">Historique des entrées</h2>
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <button
                onClick={() => setFilterTag("all")}
                className={`px-4 py-2 rounded-lg transition-colors text-sm ${
                  filterTag === "all"
                    ? "bg-blue-600 text-white"
                    : "bg-[#1e2229] dark:bg-[#1e2229] bg-gray-200 text-gray-900 dark:text-white hover:bg-[#2a2e39] dark:hover:bg-[#2a2e39] hover:bg-gray-300"
                }`}
              >
                Tous
              </button>
              {availableTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setFilterTag(tag)}
                  className={`px-4 py-2 rounded-lg transition-colors text-sm ${
                    filterTag === tag
                      ? "bg-blue-600 text-white"
                      : "bg-[#1e2229] dark:bg-[#1e2229] bg-gray-200 text-gray-900 dark:text-white hover:bg-[#2a2e39] dark:hover:bg-[#2a2e39] hover:bg-gray-300"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="p-6">
          <div className="space-y-6">
            {filteredEntries.length > 0 ? (
              filteredEntries.map((entry, index) => (
                <div key={entry.id} className="relative">
                  {index !== filteredEntries.length - 1 && (
                    <div className="absolute left-5 top-12 bottom-0 w-0.5 bg-[#1e2229] dark:bg-[#1e2229] bg-gray-200" />
                  )}
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-10 h-10 bg-blue-500/10 dark:bg-blue-500/10 bg-blue-100 rounded-full flex items-center justify-center relative z-10">
                      <Clock className="w-5 h-5 text-blue-400 dark:text-blue-400 text-blue-600" />
                    </div>
                    <div className="flex-1 bg-[#0a0b0d] dark:bg-[#0a0b0d] bg-gray-50 border border-[#1e2229] dark:border-[#1e2229] border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-blue-400 dark:text-blue-400 text-blue-600">{entry.author}</span>
                          <span className="text-gray-500 dark:text-gray-500 text-gray-400 text-sm">
                            {entry.timestamp}
                          </span>
                          {entry.tags.map((tag) => (
                            <span
                              key={tag}
                              className={`px-2 py-1 text-xs rounded ${tagColors[tag]}`}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                        {entry.content}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-600 dark:text-gray-400">
                Aucune entrée trouvée avec ce filtre
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}