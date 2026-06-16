import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Download, Search, Upload, Trash2, ChevronDown, X, Loader2, Plus, FileText } from "lucide-react";
import { useQuery, useMutation } from "@apollo/client";
import {
  DOCUMENTS_QUERY,
  DELETE_DOCUMENT_MUTATION,
  DOCUMENT_UPLOADED_SUBSCRIPTION,
} from "../../graphql/document";
import { useCurrentIncident } from "../../hooks/useCurrentIncident";
import { useAppStore } from "../../store/useAppStore";
import { useDebounce } from "../../hooks/useDebounce";
import { downloadFile, uploadFile, formatBytes } from "../../lib/fileUtils";
import type { GqlDocument, GqlDocumentCategory } from "../../types/generated";

// ── Catégories ────────────────────────────────────────────────────────────────
const CATEGORY_LABELS: Record<GqlDocumentCategory, string> = {
  ARTIFACT: "Artefact",
  FICHE_REFLEXE: "Fiche réflexe",
  RAPPORT: "Rapport",
  PROCEDURE: "Procédure",
  OTHER: "Autre",
};

const CATEGORY_COLORS: Record<GqlDocumentCategory, string> = {
  ARTIFACT: "bg-red-500/10 text-red-400",
  FICHE_REFLEXE: "bg-blue-500/10 text-blue-400",
  RAPPORT: "bg-purple-500/10 text-purple-400",
  PROCEDURE: "bg-green-500/10 text-green-400",
  OTHER: "bg-gray-500/10 text-gray-400",
};

// ── Onglets ───────────────────────────────────────────────────────────────────
type Tab = "global" | "incident";

// ── Modal d'upload ────────────────────────────────────────────────────────────
interface UploadModalProps {
  incidentId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

function UploadModal({ incidentId, onClose, onSuccess }: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<GqlDocumentCategory>("FICHE_REFLEXE");
  const [linkToIncident, setLinkToIncident] = useState(!!incidentId);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const UPLOAD_CATEGORIES: GqlDocumentCategory[] = incidentId
    ? ["ARTIFACT", "RAPPORT", "FICHE_REFLEXE", "PROCEDURE", "OTHER"]
    : ["FICHE_REFLEXE", "PROCEDURE", "RAPPORT", "OTHER"];

  async function handleUpload() {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      await uploadFile(file, {
        incidentId: linkToIncident && incidentId ? incidentId : undefined,
        category,
      });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'upload");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-[#13151a] border border-[#1e2229] rounded-lg w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e2229]">
          <h2 className="text-white font-medium">Télécharger un fichier</h2>
          <button onClick={onClose} aria-label="Fermer" className="text-gray-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Zone de sélection de fichier */}
          <div
            onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed border-[#1e2229] rounded-lg p-8 text-center cursor-pointer hover:border-blue-500/50 transition-colors"
          >
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <div>
                <FileText className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                <p className="text-white text-sm font-medium">{file.name}</p>
                <p className="text-gray-500 text-xs mt-1">{formatBytes(file.size)}</p>
              </div>
            ) : (
              <div>
                <Upload className="w-8 h-8 text-gray-500 mx-auto mb-2" />
                <p className="text-gray-400 text-sm">Cliquez pour sélectionner un fichier</p>
                <p className="text-gray-600 text-xs mt-1">Max 50 Mo</p>
              </div>
            )}
          </div>

          {/* Catégorie */}
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Catégorie</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as GqlDocumentCategory)}
              className="w-full bg-[#0a0b0d] border border-[#1e2229] rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            >
              {UPLOAD_CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </div>

          {/* Associer à l'incident */}
          {incidentId && (
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={linkToIncident}
                onChange={(e) => setLinkToIncident(e.target.checked)}
                className="w-4 h-4 accent-blue-600"
              />
              <span className="text-sm text-gray-400">Associer à l'incident courant</span>
            </label>
          )}

          {error && (
            <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-[#1e2229] text-gray-400 hover:text-white rounded-md px-3 py-2 text-sm transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50 text-white rounded-md px-3 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
              {uploading ? "Upload…" : "Télécharger"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tableau de documents ──────────────────────────────────────────────────────
interface DocumentTableProps {
  documents: GqlDocument[];
  loading: boolean;
  canWrite: boolean;
  onDelete: (doc: GqlDocument) => void;
  onDownload: (doc: GqlDocument) => void;
  filters: Record<string, string>;
  activeFilters: Set<string>;
  onToggleFilter: (col: string) => void;
  onClearFilter: (col: string) => void;
  onUpdateFilter: (col: string, val: string) => void;
}

function DocumentTable({
  documents, loading, canWrite, onDelete, onDownload,
  filters, activeFilters, onToggleFilter, onClearFilter, onUpdateFilter,
}: DocumentTableProps) {
  const columns = [
    { key: "name", label: "Nom du fichier", width: "" },
    { key: "category", label: "Catégorie", width: "w-36" },
    { key: "mimeType", label: "Type", width: "w-28" },
    { key: "sizeBytes", label: "Taille", width: "w-24" },
    { key: "createdAt", label: "Ajouté le", width: "w-36" },
    { key: "uploadedBy", label: "Par", width: "w-36" },
    { key: "_actions", label: "Actions", width: "w-24" },
  ];

  const filtered = documents.filter((doc) =>
    Object.entries(filters).every(([key, value]) => {
      if (!value) return true;
      switch (key) {
        case "name": return doc.name.toLowerCase().includes(value.toLowerCase());
        case "category": return CATEGORY_LABELS[doc.category].toLowerCase().includes(value.toLowerCase());
        case "mimeType": return doc.mimeType.toLowerCase().includes(value.toLowerCase());
        case "uploadedBy":
          return `${doc.uploadedBy.firstName} ${doc.uploadedBy.lastName}`.toLowerCase().includes(value.toLowerCase());
        default: return true;
      }
    })
  );

  return (
    <div className="bg-[#13151a] border border-[#1e2229] rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-[#0a0b0d] border-b border-[#1e2229]">
            <tr>
              {columns.map((col) => (
                <th key={col.key} scope="col" className={`px-4 py-3 text-left ${col.width}${col.key === "_actions" ? " sr-only" : ""}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-400 uppercase tracking-wider">{col.label}</span>
                    {col.key !== "_actions" && (
                      <button
                        onClick={() => onToggleFilter(col.key)}
                        aria-label={`Filtrer par ${col.label}`}
                        aria-pressed={activeFilters.has(col.key)}
                        className={`p-1 rounded transition-colors ${
                          activeFilters.has(col.key)
                            ? "bg-blue-500/20 text-blue-400"
                            : "hover:bg-[#1e2229] text-gray-500"
                        }`}
                      >
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  {activeFilters.has(col.key) && (
                    <input
                      type="text"
                      value={filters[col.key] || ""}
                      onChange={(e) => onUpdateFilter(col.key, e.target.value)}
                      placeholder="Filtrer…"
                      className="mt-2 w-full px-2 py-1 bg-[#13151a] border border-[#1e2229] rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e2229]">
            {loading && !documents.length ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12">
                  <div className="flex items-center justify-center gap-2 text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Chargement…</span>
                  </div>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-gray-500 text-sm">
                  {documents.length === 0
                    ? "Aucun document — téléchargez-en un."
                    : "Aucun document ne correspond aux filtres."}
                </td>
              </tr>
            ) : (
              filtered.map((doc) => (
                <tr key={doc.id} className="hover:bg-[#1a1d24] transition-colors">
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-gray-500 flex-shrink-0" />
                      <span className="text-sm text-white">{doc.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded ${CATEGORY_COLORS[doc.category]}`}>
                      {CATEGORY_LABELS[doc.category]}
                    </span>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <span className="text-xs text-gray-500 font-mono">{doc.mimeType.split("/")[1] ?? doc.mimeType}</span>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-400">
                    {formatBytes(doc.sizeBytes)}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-400">
                    {new Date(doc.createdAt).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-400">
                    {doc.uploadedBy.firstName} {doc.uploadedBy.lastName}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onDownload(doc)}
                        className="p-1.5 hover:bg-[#2a2e39] rounded transition-colors text-gray-500 hover:text-white"
                        title="Télécharger"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      {canWrite && (
                        <button
                          onClick={() => onDelete(doc)}
                          className="p-1.5 hover:bg-red-500/10 rounded transition-colors text-gray-500 hover:text-red-400"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {documents.length > 0 && (
        <div className="px-4 py-3 border-t border-[#1e2229] text-xs text-gray-500">
          {filtered.length} document{filtered.length > 1 ? "s" : ""}
          {filtered.length !== documents.length && ` sur ${documents.length}`}
        </div>
      )}
    </div>
  );
}

// ── Page Bibliothèque ─────────────────────────────────────────────────────────

export default function Bibliotheque() {
  const { incidentId } = useCurrentIncident();
  const hasPermission = useAppStore((s) => s.hasPermission);
  const canWrite = hasPermission("BIBLIOTHEQUE", "WRITE") || hasPermission("DOCUMENTS", "WRITE");

  const [activeTab, setActiveTab] = useState<Tab>("global");
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({
    name: "", category: "", mimeType: "", uploadedBy: "",
  });
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [showUpload, setShowUpload] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<GqlDocument | null>(null);

  // ── Queries ───────────────────────────────────────────────────────────────
  // Global docs: incidentId omitted → null → library documents
  const {
    data: globalData,
    loading: globalLoading,
    refetch: refetchGlobal,
  } = useQuery<{ documents: GqlDocument[] }>(DOCUMENTS_QUERY, {
    variables: {},
    fetchPolicy: "cache-and-network",
  });

  // Incident docs: linked to the current incident
  const {
    data: incidentData,
    loading: incidentLoading,
    refetch: refetchIncident,
    subscribeToMore: subscribeIncident,
  } = useQuery<{ documents: GqlDocument[] }>(DOCUMENTS_QUERY, {
    variables: { incidentId },
    skip: !incidentId,
    fetchPolicy: "cache-and-network",
  });

  // ── Subscription temps réel (documents incident) ──────────────────────────
  useEffect(() => {
    if (!incidentId) return;
    const unsub = subscribeIncident<{ documentUploaded: GqlDocument }>({
      document: DOCUMENT_UPLOADED_SUBSCRIPTION,
      variables: { incidentId },
      updateQuery(prev, { subscriptionData }) {
        const newDoc = subscriptionData.data?.documentUploaded;
        if (!newDoc) return prev;
        if (prev.documents.some((d) => d.id === newDoc.id)) return prev;
        return { documents: [newDoc, ...prev.documents] };
      },
    });
    return unsub;
  }, [incidentId, subscribeIncident]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const [deleteDocument] = useMutation<{ deleteDocument: boolean }, { id: string }>(
    DELETE_DOCUMENT_MUTATION,
    {
      update(cache, _result, { variables }) {
        if (!variables?.id) return;
        // Purge from both queries
        for (const vars of [{}, { incidentId }]) {
          cache.updateQuery({ query: DOCUMENTS_QUERY, variables: vars }, (prev) => {
            if (!prev) return prev;
            return { documents: prev.documents.filter((d: GqlDocument) => d.id !== variables.id) };
          });
        }
      },
    }
  );

  // ── Handlers ──────────────────────────────────────────────────────────────
  async function handleDownload(doc: GqlDocument) {
    setDownloadError(null);
    try {
      await downloadFile(doc.id, doc.name);
    } catch (err: unknown) {
      setDownloadError(err instanceof Error ? err.message : "Erreur de téléchargement");
    }
  }

  async function handleDeleteConfirmed(doc: GqlDocument) {
    setConfirmDelete(null);
    try {
      await deleteDocument({ variables: { id: doc.id } });
      toast.success("Document supprimé");
    } catch {
      toast.error("Erreur lors de la suppression");
    }
  }

  function toggleFilter(col: string) {
    const next = new Set(activeFilters);
    if (next.has(col)) {
      next.delete(col);
      setFilters((prev) => ({ ...prev, [col]: "" }));
    } else {
      next.add(col);
    }
    setActiveFilters(next);
  }

  function clearFilter(col: string) {
    const next = new Set(activeFilters);
    next.delete(col);
    setActiveFilters(next);
    setFilters((prev) => ({ ...prev, [col]: "" }));
  }

  // ── Données filtrées par recherche ────────────────────────────────────────
  const debouncedSearch = useDebounce(searchQuery);
  const currentDocs = (activeTab === "global" ? globalData?.documents : incidentData?.documents) ?? [];
  const searchedDocs = debouncedSearch
    ? currentDocs.filter(
        (d) =>
          d.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
          CATEGORY_LABELS[d.category].toLowerCase().includes(debouncedSearch.toLowerCase())
      )
    : currentDocs;

  const isLoading = activeTab === "global" ? globalLoading : incidentLoading;

  return (
    <div className="p-8 bg-[#0f1116] min-h-screen">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl mb-2 text-white">Bibliothèque</h1>
          <p className="text-gray-400">Fiches réflexes, procédures, artefacts et pièces jointes</p>
        </div>
        {canWrite && (
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Télécharger un fichier
          </button>
        )}
      </div>

      {/* Erreur download */}
      {downloadError && (
        <div className="mb-4 bg-red-400/10 border border-red-400/20 rounded-lg p-3 flex items-center justify-between">
          <span className="text-red-400 text-sm">{downloadError}</span>
          <button onClick={() => setDownloadError(null)} aria-label="Fermer l'erreur" className="text-red-400 hover:text-red-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Onglets */}
      <div className="flex gap-1 mb-6 bg-[#13151a] border border-[#1e2229] rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab("global")}
          className={`px-4 py-2 rounded text-sm transition-colors ${
            activeTab === "global"
              ? "bg-[#1e2229] text-white"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          Bibliothèque globale
          {globalData && (
            <span className="ml-2 text-xs text-gray-500">({globalData.documents.length})</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("incident")}
          className={`px-4 py-2 rounded text-sm transition-colors ${
            activeTab === "incident"
              ? "bg-[#1e2229] text-white"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          Documents de l'incident
          {incidentData && (
            <span className="ml-2 text-xs text-gray-500">({incidentData.documents.length})</span>
          )}
        </button>
      </div>

      {/* Recherche */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Rechercher un document"
            placeholder="Rechercher un document…"
            className="w-full pl-12 pr-4 py-3 bg-[#13151a] border border-[#1e2229] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
      </div>

      {/* Filtres actifs */}
      {activeFilters.size > 0 && (
        <div className="mb-6 bg-[#13151a] border border-[#1e2229] rounded-lg p-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-400">Filtres actifs :</span>
            {Object.entries(filters)
              .filter(([, v]) => v !== "")
              .map(([key, value]) => (
                <span
                  key={key}
                  className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/10 text-blue-400 text-sm rounded-lg"
                >
                  <span className="capitalize">{key} :</span>
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

      {/* Tableau */}
      <DocumentTable
        documents={searchedDocs}
        loading={isLoading}
        canWrite={canWrite}
        onDelete={(doc) => setConfirmDelete(doc)}
        onDownload={handleDownload}
        filters={filters}
        activeFilters={activeFilters}
        onToggleFilter={toggleFilter}
        onClearFilter={clearFilter}
        onUpdateFilter={(col, val) => setFilters((prev) => ({ ...prev, [col]: val }))}
      />

      {/* Modal upload */}
      {showUpload && (
        <UploadModal
          incidentId={incidentId}
          onClose={() => setShowUpload(false)}
          onSuccess={() => {
            void refetchGlobal();
            void refetchIncident();
          }}
        />
      )}
      <ConfirmDialog
        open={!!confirmDelete}
        description={confirmDelete ? `Supprimer "${confirmDelete.name}" ?` : ""}
        onConfirm={() => confirmDelete && handleDeleteConfirmed(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
