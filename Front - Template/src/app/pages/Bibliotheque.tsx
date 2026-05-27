import { Download, Search, Upload, Trash2, ChevronDown, X } from "lucide-react";
import { useState } from "react";

interface FileItem {
  id: number;
  name: string;
  category: string;
  size: string;
  lastModified: string;
  folder: string;
}

const mockFiles: FileItem[] = [
  {
    id: 11,
    name: "Fiche-Reflexe-Ransomware.pdf",
    category: "Incident",
    size: "2.3 MB",
    lastModified: "2026-03-15",
    folder: "Fiches Réflexes",
  },
  {
    id: 12,
    name: "Fiche-Reflexe-DDoS.pdf",
    category: "Incident",
    size: "1.8 MB",
    lastModified: "2026-03-10",
    folder: "Fiches Réflexes",
  },
  {
    id: 13,
    name: "Fiche-Reflexe-Fuite-Donnees.pdf",
    category: "Incident",
    size: "2.1 MB",
    lastModified: "2026-03-08",
    folder: "Fiches Réflexes",
  },
  {
    id: 14,
    name: "Fiche-Reflexe-Phishing.pdf",
    category: "Incident",
    size: "1.5 MB",
    lastModified: "2026-02-28",
    folder: "Fiches Réflexes",
  },
  {
    id: 21,
    name: "PCA-Plan-Continuite-Activite.pdf",
    category: "Continuité",
    size: "4.5 MB",
    lastModified: "2026-01-15",
    folder: "Procédures",
  },
  {
    id: 22,
    name: "PRA-Plan-Reprise-Activite.pdf",
    category: "Continuité",
    size: "5.2 MB",
    lastModified: "2026-01-15",
    folder: "Procédures",
  },
  {
    id: 23,
    name: "Procedure-Escalade.pdf",
    category: "Processus",
    size: "1.2 MB",
    lastModified: "2026-02-01",
    folder: "Procédures",
  },
  {
    id: 24,
    name: "Procedure-Communication-Crise.pdf",
    category: "Communication",
    size: "2.8 MB",
    lastModified: "2026-02-05",
    folder: "Procédures",
  },
  {
    id: 31,
    name: "Modele-Rapport-Incident.docx",
    category: "Documentation",
    size: "450 KB",
    lastModified: "2026-03-01",
    folder: "Modèles",
  },
  {
    id: 32,
    name: "Modele-Communique-Presse.docx",
    category: "Communication",
    size: "320 KB",
    lastModified: "2026-03-01",
    folder: "Modèles",
  },
  {
    id: 33,
    name: "Modele-Main-Courante.xlsx",
    category: "Documentation",
    size: "780 KB",
    lastModified: "2026-02-20",
    folder: "Modèles",
  },
  {
    id: 41,
    name: "Contacts-Urgence-ANSSI.pdf",
    category: "Contacts",
    size: "250 KB",
    lastModified: "2026-01-10",
    folder: "Contacts",
  },
  {
    id: 42,
    name: "Contacts-Prestataires-Securite.pdf",
    category: "Contacts",
    size: "380 KB",
    lastModified: "2026-01-10",
    folder: "Contacts",
  },
  {
    id: 43,
    name: "Contacts-Juridiques.pdf",
    category: "Contacts",
    size: "290 KB",
    lastModified: "2026-01-10",
    folder: "Contacts",
  },
];

export default function Bibliotheque() {
  const [files, setFiles] = useState<FileItem[]>(mockFiles);
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({
    name: "",
    folder: "",
    category: "",
    size: "",
    lastModified: "",
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

  const handleDelete = (id: number) => {
    if (confirm("Êtes-vous sûr de vouloir supprimer ce fichier ?")) {
      setFiles((prev) => prev.filter((file) => file.id !== id));
    }
  };

  const handleUpload = () => {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.onchange = (e) => {
      const target = e.target as HTMLInputElement;
      if (target.files && target.files[0]) {
        const file = target.files[0];
        const newFile: FileItem = {
          id: Math.max(...files.map((f) => f.id)) + 1,
          name: file.name,
          category: "Documentation",
          size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
          lastModified: new Date().toISOString().split("T")[0],
          folder: "Modèles",
        };
        setFiles((prev) => [...prev, newFile]);
      }
    };
    fileInput.click();
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      Incident: "bg-red-500/10 text-red-400",
      Continuité: "bg-blue-500/10 text-blue-400",
      Processus: "bg-green-500/10 text-green-400",
      Communication: "bg-purple-500/10 text-purple-400",
      Documentation: "bg-yellow-500/10 text-yellow-400",
      Contacts: "bg-orange-500/10 text-orange-400",
    };
    return colors[category] || "bg-gray-500/10 text-gray-400";
  };

  const filteredFiles = files.filter((file) => {
    // Search query filter
    if (
      searchQuery &&
      !file.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !file.folder.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }

    // Column filters
    return Object.entries(filters).every(([key, value]) => {
      if (!value) return true;
      const fileValue = file[key as keyof FileItem];
      if (typeof fileValue === "string") {
        return fileValue.toLowerCase().includes(value.toLowerCase());
      }
      return true;
    });
  });

  const activeFilterCount = Object.values(filters).filter(
    (v) => v !== ""
  ).length;

  return (
    <div className="p-8 bg-[#0f1116] dark:bg-[#0f1116] bg-gray-50 min-h-screen">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl mb-2 text-gray-900 dark:text-white">
            Bibliothèque
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Fiches réflexes, procédures et documents de référence
          </p>
        </div>
        <button
          onClick={handleUpload}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Upload className="w-4 h-4" />
          Télécharger un fichier
        </button>
      </div>

      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher un document..."
            className="w-full pl-12 pr-4 py-3 bg-[#13151a] dark:bg-[#13151a] bg-white border border-[#1e2229] dark:border-[#1e2229] border-gray-200 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
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

      {/* File Table */}
      <div className="bg-[#13151a] dark:bg-[#13151a] bg-white border border-[#1e2229] dark:border-[#1e2229] border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#0a0b0d] dark:bg-[#0a0b0d] bg-gray-100 border-b border-[#1e2229] dark:border-[#1e2229] border-gray-200">
              <tr>
                {[
                  { key: "name", label: "Nom du fichier", width: "" },
                  { key: "folder", label: "Dossier", width: "w-48" },
                  { key: "category", label: "Tag", width: "w-40" },
                  { key: "size", label: "Taille", width: "w-28" },
                  { key: "lastModified", label: "Modifié le", width: "w-32" },
                  { key: "actions", label: "Actions", width: "w-28" },
                ].map((column) => (
                  <th
                    key={column.key}
                    className={`px-4 py-3 text-left ${column.width}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                        {column.label}
                      </span>
                      {column.key !== "actions" && (
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
              {filteredFiles.length > 0 ? (
                filteredFiles.map((file) => (
                  <tr
                    key={file.id}
                    className="hover:bg-[#1a1d24] dark:hover:bg-[#1a1d24] hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-4">
                      <span className="text-sm text-gray-900 dark:text-white">
                        {file.name}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {file.folder}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs rounded ${getCategoryColor(
                          file.category
                        )}`}
                      >
                        {file.category}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {file.size}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {file.lastModified}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button
                          className="p-2 hover:bg-[#2a2e39] dark:hover:bg-[#2a2e39] hover:bg-gray-200 rounded transition-colors"
                          title="Télécharger"
                        >
                          <Download className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                        </button>
                        <button
                          onClick={() => handleDelete(file.id)}
                          className="p-2 hover:bg-red-500/10 rounded transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-gray-600 dark:text-gray-400"
                  >
                    Aucun document trouvé
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stats Footer */}
      <div className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
        {filteredFiles.length} document(s) affiché(s) sur {files.length} au
        total
      </div>
    </div>
  );
}
