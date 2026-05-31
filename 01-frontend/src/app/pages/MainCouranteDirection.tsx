import { useState, useEffect, useRef } from "react";
import { Download, Plus, Clock, Tag, Filter, Loader2, Pencil, Trash2, Check, X } from "lucide-react";
import { exportPdf } from "../../lib/exportUtils";
import { useQuery, useMutation } from "@apollo/client";
import {
  LOG_ENTRIES_QUERY,
  CREATE_LOG_ENTRY_MUTATION,
  EDIT_LOG_ENTRY_MUTATION,
  DELETE_LOG_ENTRY_MUTATION,
  ADD_TAG_TO_LOG_ENTRY_MUTATION,
  REMOVE_TAG_FROM_LOG_ENTRY_MUTATION,
  LOG_ENTRY_ADDED_SUBSCRIPTION,
  LOG_ENTRY_UPDATED_SUBSCRIPTION,
} from "../../graphql/logEntry";
import { TAGS_QUERY, CREATE_TAG_MUTATION } from "../../graphql/tag";
import { useCurrentIncident } from "../../hooks/useCurrentIncident";
import { useAppStore } from "../../store/useAppStore";
import type { GqlLogEntry, GqlTag } from "../../types/api";

const CELL = "DIRECTIONAL" as const;

// ── Couleur d'un tag (couleur hex → classes Tailwind inline) ─────────────────
function TagBadge({ tag, onRemove }: { tag: GqlTag; onRemove?: () => void }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
      style={{ backgroundColor: `${tag.color}20`, color: tag.color, border: `1px solid ${tag.color}40` }}
    >
      {tag.name}
      {onRemove && (
        <button onClick={onRemove} className="hover:opacity-70 transition-opacity">
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}

// ── Entrée individuelle ───────────────────────────────────────────────────────
interface EntryRowProps {
  entry: GqlLogEntry;
  availableTags: GqlTag[];
  canWrite: boolean;
  currentUserId: string | undefined;
  onDelete: (id: string) => void;
  onAddTag: (entryId: string, tagId: string) => void;
  onRemoveTag: (entryId: string, tagId: string) => void;
}

function EntryRow({
  entry, availableTags, canWrite, currentUserId, onDelete, onAddTag, onRemoveTag,
}: EntryRowProps) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(entry.content);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [editLogEntry, { loading: saving }] = useMutation(EDIT_LOG_ENTRY_MUTATION);

  async function saveEdit() {
    if (!editContent.trim() || editContent === entry.content) {
      setEditing(false);
      return;
    }
    await editLogEntry({ variables: { id: entry.id, content: editContent } });
    setEditing(false);
  }

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  const isOwn = entry.author.id === currentUserId;
  const existingTagIds = new Set(entry.tags.map((t) => t.id));
  const addableTags = availableTags.filter((t) => !existingTagIds.has(t.id));

  return (
    <div className="relative">
      <div className="flex gap-4">
        {/* Icône */}
        <div className="flex-shrink-0 w-10 h-10 bg-blue-500/10 rounded-full flex items-center justify-center">
          <Clock className="w-5 h-5 text-blue-400" />
        </div>

        {/* Contenu */}
        <div className="flex-1 bg-[#0a0b0d] border border-[#1e2229] rounded-lg p-4 min-w-0">
          {/* En-tête */}
          <div className="flex items-start justify-between mb-2 gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-blue-400 text-sm font-medium">
                {entry.author.firstName} {entry.author.lastName}
              </span>
              <span className="text-gray-500 text-xs">
                {new Date(entry.createdAt).toLocaleString("fr-FR", {
                  day: "2-digit", month: "2-digit", year: "numeric",
                  hour: "2-digit", minute: "2-digit",
                })}
              </span>
              {entry.isEdited && (
                <span className="text-gray-600 text-xs italic">(modifié)</span>
              )}
            </div>

            {/* Actions */}
            {canWrite && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <div className="relative">
                  <button
                    onClick={() => setShowTagPicker((v) => !v)}
                    className="p-1 hover:bg-[#1e2229] rounded transition-colors text-gray-500 hover:text-white"
                    title="Ajouter un tag"
                  >
                    <Tag className="w-3.5 h-3.5" />
                  </button>
                  {showTagPicker && addableTags.length > 0 && (
                    <div className="absolute right-0 top-7 bg-[#1e2229] border border-[#2a2e39] rounded-lg shadow-lg z-20 p-2 min-w-32">
                      {addableTags.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => { onAddTag(entry.id, t.id); setShowTagPicker(false); }}
                          className="flex items-center gap-2 w-full px-2 py-1 rounded hover:bg-[#2a2e39] transition-colors text-sm text-gray-300 text-left"
                        >
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: t.color }}
                          />
                          {t.name}
                        </button>
                      ))}
                    </div>
                  )}
                  {showTagPicker && addableTags.length === 0 && (
                    <div className="absolute right-0 top-7 bg-[#1e2229] border border-[#2a2e39] rounded-lg shadow-lg z-20 p-3 text-xs text-gray-500">
                      Tous les tags sont déjà associés
                    </div>
                  )}
                </div>
                {isOwn && !editing && (
                  <button
                    onClick={() => { setEditContent(entry.content); setEditing(true); }}
                    className="p-1 hover:bg-[#1e2229] rounded transition-colors text-gray-500 hover:text-white"
                    title="Modifier"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => onDelete(entry.id)}
                  className="p-1 hover:bg-red-500/10 rounded transition-colors text-gray-500 hover:text-red-400"
                  title="Supprimer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Tags */}
          {entry.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {entry.tags.map((tag) => (
                <TagBadge
                  key={tag.id}
                  tag={tag}
                  onRemove={canWrite ? () => onRemoveTag(entry.id, tag.id) : undefined}
                />
              ))}
            </div>
          )}

          {/* Contenu ou édition */}
          {editing ? (
            <div>
              <textarea
                ref={textareaRef}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full h-24 bg-[#13151a] border border-blue-500/50 rounded-md p-3 text-gray-100 text-sm focus:outline-none resize-none"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={saveEdit}
                  disabled={saving}
                  className="flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                >
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  Sauvegarder
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="flex items-center gap-1 px-3 py-1 border border-[#1e2229] text-gray-400 text-xs rounded hover:text-white transition-colors"
                >
                  <X className="w-3 h-3" />
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">
              {entry.content}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page Main Courante Direction ──────────────────────────────────────────────

export default function MainCouranteDirection() {
  const { incidentId, incident } = useCurrentIncident();
  const currentUser = useAppStore((s) => s.currentUser);
  const hasPermission = useAppStore((s) => s.hasPermission);
  const canWrite = hasPermission("MAIN_COURANTE_DIR", "WRITE");

  const [newEntry, setNewEntry] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [filterTagId, setFilterTagId] = useState<string>("all");
  const [submitting, setSubmitting] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [showNewTagInput, setShowNewTagInput] = useState(false);
  const [exporting, setExporting] = useState(false);

  // ── Queries ───────────────────────────────────────────────────────────────
  const {
    data: entriesData,
    loading: entriesLoading,
    error: entriesError,
    subscribeToMore,
  } = useQuery<{ logEntries: GqlLogEntry[] }>(LOG_ENTRIES_QUERY, {
    variables: { incidentId, cell: CELL },
    skip: !incidentId,
    fetchPolicy: "cache-and-network",
  });

  const { data: tagsData } = useQuery<{ tags: GqlTag[] }>(TAGS_QUERY);

  // ── Subscriptions temps réel ──────────────────────────────────────────────
  useEffect(() => {
    if (!incidentId) return;
    const unsubAdded = subscribeToMore<{ logEntryAdded: GqlLogEntry }>({
      document: LOG_ENTRY_ADDED_SUBSCRIPTION,
      variables: { incidentId, cell: CELL },
      updateQuery(prev, { subscriptionData }) {
        const newEntry = subscriptionData.data?.logEntryAdded;
        if (!newEntry) return prev;
        if (prev.logEntries.some((e) => e.id === newEntry.id)) return prev;
        return { logEntries: [newEntry, ...prev.logEntries] };
      },
    });
    const unsubUpdated = subscribeToMore<{ logEntryUpdated: GqlLogEntry }>({
      document: LOG_ENTRY_UPDATED_SUBSCRIPTION,
      variables: { incidentId, cell: CELL },
      updateQuery(prev, { subscriptionData }) {
        const updated = subscriptionData.data?.logEntryUpdated;
        if (!updated) return prev;
        return {
          logEntries: prev.logEntries.map((e) => (e.id === updated.id ? updated : e)),
        };
      },
    });
    return () => { unsubAdded(); unsubUpdated(); };
  }, [incidentId, subscribeToMore]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const [createLogEntry] = useMutation<{ createLogEntry: GqlLogEntry }>(
    CREATE_LOG_ENTRY_MUTATION,
    {
      update(cache, { data: result }) {
        if (!result?.createLogEntry) return;
        cache.updateQuery(
          { query: LOG_ENTRIES_QUERY, variables: { incidentId, cell: CELL } },
          (prev) => {
            if (!prev) return { logEntries: [result.createLogEntry] };
            if (prev.logEntries.some((e: GqlLogEntry) => e.id === result.createLogEntry.id)) return prev;
            return { logEntries: [result.createLogEntry, ...prev.logEntries] };
          }
        );
      },
    }
  );

  const [deleteLogEntry] = useMutation<{ deleteLogEntry: boolean }, { id: string }>(
    DELETE_LOG_ENTRY_MUTATION,
    {
      update(cache, _result, { variables }) {
        if (!variables?.id) return;
        cache.updateQuery(
          { query: LOG_ENTRIES_QUERY, variables: { incidentId, cell: CELL } },
          (prev) => {
            if (!prev) return prev;
            return { logEntries: prev.logEntries.filter((e: GqlLogEntry) => e.id !== variables.id) };
          }
        );
      },
    }
  );

  const [addTag] = useMutation(ADD_TAG_TO_LOG_ENTRY_MUTATION);
  const [removeTag] = useMutation(REMOVE_TAG_FROM_LOG_ENTRY_MUTATION);

  const [createTag] = useMutation<{ createTag: GqlTag }>(CREATE_TAG_MUTATION, {
    update(cache, { data: result }) {
      if (!result?.createTag) return;
      cache.updateQuery({ query: TAGS_QUERY }, (prev) => {
        if (!prev) return { tags: [result.createTag] };
        return { tags: [...prev.tags, result.createTag] };
      });
    },
  });

  // ── Handlers ──────────────────────────────────────────────────────────────
  async function handleAddEntry() {
    if (!newEntry.trim() || !incidentId) return;
    setSubmitting(true);
    try {
      const result = await createLogEntry({
        variables: { incidentId, cell: CELL, content: newEntry.trim() },
      });
      const entryId = result.data?.createLogEntry?.id;
      if (entryId && selectedTagIds.length > 0) {
        await Promise.all(
          selectedTagIds.map((tagId) => addTag({ variables: { logEntryId: entryId, tagId } }))
        );
      }
      setNewEntry("");
      setSelectedTagIds([]);
    } catch {
      // error handled silently — form stays
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateTag() {
    if (!newTagName.trim()) return;
    await createTag({ variables: { name: newTagName.trim() } });
    setNewTagName("");
    setShowNewTagInput(false);
  }

  function toggleSelectedTag(id: string) {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  }

  // ── Données filtrées ──────────────────────────────────────────────────────
  const entries = entriesData?.logEntries ?? [];
  const tags = tagsData?.tags ?? [];

  const filteredEntries =
    filterTagId === "all"
      ? entries
      : entries.filter((e) => e.tags.some((t) => t.id === filterTagId));

  const uniqueAuthors = new Set(entries.map((e) => e.author.id)).size;

  return (
    <div className="p-8 bg-[#0f1116] min-h-screen">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl mb-2 text-white">Main courante — Cellule de Direction</h1>
          <p className="text-gray-400">Journal des décisions stratégiques et communications</p>
        </div>
        <button
          onClick={async () => {
            if (!incidentId || exporting) return;
            setExporting(true);
            try { await exportPdf(incidentId, incident?.name ?? incidentId); }
            catch (e) { alert(e instanceof Error ? e.message : "Erreur export"); }
            finally { setExporting(false); }
          }}
          disabled={exporting}
          className="flex items-center gap-2 bg-[#1e2229] hover:bg-[#2a2e39] text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          title="Exporter la main courante en PDF"
        >
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {exporting ? "Export…" : "Exporter PDF"}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        <div className="bg-[#13151a] border border-[#1e2229] rounded-lg p-6">
          <p className="text-gray-400 text-sm mb-2">Entrées totales</p>
          <p className="text-3xl text-white">{entries.length}</p>
        </div>
        <div className="bg-[#13151a] border border-[#1e2229] rounded-lg p-6">
          <p className="text-gray-400 text-sm mb-2">Dernière entrée</p>
          <p className="text-sm text-white">
            {entries[0]
              ? new Date(entries[0].createdAt).toLocaleString("fr-FR", {
                  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                })
              : "—"}
          </p>
        </div>
        <div className="bg-[#13151a] border border-[#1e2229] rounded-lg p-6">
          <p className="text-gray-400 text-sm mb-2">Contributeurs</p>
          <p className="text-3xl text-white">{uniqueAuthors}</p>
        </div>
      </div>

      {/* Formulaire nouvelle entrée */}
      {canWrite && (
        <div className="bg-[#13151a] border border-[#1e2229] rounded-lg p-6 mb-6">
          <h2 className="text-xl mb-4 text-white">Nouvelle entrée</h2>

          {/* Sélection des tags */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <label className="text-sm text-gray-400">Tags</label>
              {!showNewTagInput && (
                <button
                  onClick={() => setShowNewTagInput(true)}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-400 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Nouveau tag
                </button>
              )}
            </div>
            {showNewTagInput && (
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateTag()}
                  placeholder="Nom du tag…"
                  className="flex-1 bg-[#0a0b0d] border border-[#1e2229] rounded px-3 py-1.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={handleCreateTag}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
                >
                  Créer
                </button>
                <button
                  onClick={() => { setShowNewTagInput(false); setNewTagName(""); }}
                  className="px-3 py-1.5 border border-[#1e2229] text-gray-400 hover:text-white text-sm rounded transition-colors"
                >
                  Annuler
                </button>
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => toggleSelectedTag(tag.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors"
                  style={
                    selectedTagIds.includes(tag.id)
                      ? { backgroundColor: `${tag.color}20`, color: tag.color, border: `1px solid ${tag.color}50` }
                      : { backgroundColor: "#0a0b0d", color: "#9ca3af", border: "1px solid #1e2229" }
                  }
                >
                  <Tag className="w-3 h-3" />
                  {tag.name}
                </button>
              ))}
              {tags.length === 0 && (
                <p className="text-sm text-gray-600">Aucun tag disponible — créez-en un.</p>
              )}
            </div>
          </div>

          <textarea
            value={newEntry}
            onChange={(e) => setNewEntry(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleAddEntry();
            }}
            placeholder="Saisir une nouvelle entrée… (Ctrl+Entrée pour envoyer)"
            className="w-full h-32 bg-[#0a0b0d] border border-[#1e2229] rounded-lg p-4 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors resize-none text-sm"
          />
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleAddEntry}
              disabled={!newEntry.trim() || submitting}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {submitting ? "Enregistrement…" : "Ajouter l'entrée"}
            </button>
          </div>
        </div>
      )}

      {/* Historique */}
      <div className="bg-[#13151a] border border-[#1e2229] rounded-lg">
        <div className="p-6 border-b border-[#1e2229]">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <h2 className="text-xl text-white">Historique des entrées</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="w-4 h-4 text-gray-400" />
              <button
                onClick={() => setFilterTagId("all")}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  filterTagId === "all"
                    ? "bg-blue-600 text-white"
                    : "bg-[#1e2229] text-white hover:bg-[#2a2e39]"
                }`}
              >
                Tous
              </button>
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => setFilterTagId(tag.id)}
                  className="px-3 py-1.5 rounded-lg text-sm transition-colors"
                  style={
                    filterTagId === tag.id
                      ? { backgroundColor: tag.color, color: "#fff" }
                      : { backgroundColor: "#1e2229", color: "#9ca3af" }
                  }
                >
                  {tag.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-6">
          {entriesLoading && !entriesData && (
            <div className="flex items-center justify-center py-8 text-gray-500 gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Chargement…</span>
            </div>
          )}
          {entriesError && (
            <p className="text-red-400 text-sm text-center py-4">{entriesError.message}</p>
          )}
          {!entriesLoading && filteredEntries.length === 0 && (
            <p className="text-center text-gray-500 py-8 text-sm">
              {entries.length === 0
                ? "Aucune entrée — soyez le premier à contribuer."
                : "Aucune entrée pour ce filtre."}
            </p>
          )}
          <div className="space-y-6">
            {filteredEntries.map((entry, index) => (
              <div key={entry.id} className="relative">
                {index !== filteredEntries.length - 1 && (
                  <div className="absolute left-5 top-12 bottom-0 w-0.5 bg-[#1e2229]" />
                )}
                <EntryRow
                  entry={entry}
                  availableTags={tags}
                  canWrite={canWrite}
                  currentUserId={currentUser?.id}
                  onDelete={(id) => {
                    if (confirm("Supprimer cette entrée ?"))
                      deleteLogEntry({ variables: { id } });
                  }}
                  onAddTag={(entryId, tagId) => addTag({ variables: { logEntryId: entryId, tagId } })}
                  onRemoveTag={(entryId, tagId) => removeTag({ variables: { logEntryId: entryId, tagId } })}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
