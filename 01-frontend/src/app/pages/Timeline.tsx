import { useState, useEffect } from "react";
import { ChevronDown, X, Plus, Loader2, Trash2, Download } from "lucide-react";
import { exportXlsx } from "../../lib/exportUtils";
import { useQuery, useMutation } from "@apollo/client";
import {
  TIMELINE_EVENTS_QUERY,
  CREATE_TIMELINE_EVENT_MUTATION,
  DELETE_TIMELINE_EVENT_MUTATION,
  TIMELINE_EVENT_ADDED_SUBSCRIPTION,
} from "../../graphql/timeline";
import { useCurrentIncident } from "../../hooks/useCurrentIncident";
import { useAppStore } from "../../store/useAppStore";
import type { GqlTimelineEvent, TimelineEventType } from "../../types/generated";

// ── Types d'événements ────────────────────────────────────────────────────────
const EVENT_TYPES: TimelineEventType[] = [
  "DETECTION", "ACTION", "DECISION", "COMMUNICATION", "ESCALATION", "RESOLUTION",
];

const EVENT_TYPE_LABELS: Record<TimelineEventType, string> = {
  DETECTION: "Détection",
  ACTION: "Action",
  DECISION: "Décision",
  COMMUNICATION: "Communication",
  ESCALATION: "Escalade",
  RESOLUTION: "Résolution",
};

const EVENT_TYPE_COLORS: Record<TimelineEventType, string> = {
  DETECTION: "bg-red-500/10 text-red-400",
  ACTION: "bg-blue-500/10 text-blue-400",
  DECISION: "bg-purple-500/10 text-purple-400",
  COMMUNICATION: "bg-yellow-500/10 text-yellow-400",
  ESCALATION: "bg-orange-500/10 text-orange-400",
  RESOLUTION: "bg-green-500/10 text-green-400",
};

// ── Formulaire d'ajout d'événement ────────────────────────────────────────────
interface NewEventForm {
  type: TimelineEventType;
  title: string;
  description: string;
  occurredAt: string;
  ipAddress: string;
  assetName: string;
  affectedUser: string;
}

const EMPTY_FORM: NewEventForm = {
  type: "DETECTION",
  title: "",
  description: "",
  occurredAt: new Date().toISOString().slice(0, 16), // YYYY-MM-DDTHH:mm
  ipAddress: "",
  assetName: "",
  affectedUser: "",
};

interface AddEventModalProps {
  onClose: () => void;
  onSubmit: (data: NewEventForm) => Promise<void>;
  submitting: boolean;
  error: string | null;
}

function AddEventModal({ onClose, onSubmit, submitting, error }: AddEventModalProps) {
  const [form, setForm] = useState<NewEventForm>(EMPTY_FORM);

  function set(key: keyof NewEventForm, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSubmit(form);
  }

  const inputCls =
    "w-full bg-[#0a0b0d] border border-[#1e2229] rounded-md px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors";

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-[#13151a] border border-[#1e2229] rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e2229]">
          <h2 className="text-white font-medium">Ajouter un événement</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Type *</label>
            <select
              value={form.type}
              onChange={(e) => set("type", e.target.value)}
              className={inputCls}
            >
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>{EVENT_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Titre *</label>
            <input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              required
              className={inputCls}
              placeholder="Ex : Détection d'un accès non autorisé"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Date / Heure *</label>
            <input
              type="datetime-local"
              value={form.occurredAt}
              onChange={(e) => set("occurredAt", e.target.value)}
              required
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={3}
              className="w-full bg-[#0a0b0d] border border-[#1e2229] rounded-md px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors resize-none"
              placeholder="Description détaillée de l'événement…"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Asset</label>
              <input
                value={form.assetName}
                onChange={(e) => set("assetName", e.target.value)}
                className={inputCls}
                placeholder="Serveur-DB-01"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Adresse IP</label>
              <input
                value={form.ipAddress}
                onChange={(e) => set("ipAddress", e.target.value)}
                className={inputCls}
                placeholder="10.0.1.15"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Utilisateur affecté</label>
            <input
              value={form.affectedUser}
              onChange={(e) => set("affectedUser", e.target.value)}
              className={inputCls}
              placeholder="jean.martin@company.com"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-[#1e2229] text-gray-400 hover:text-white rounded-md px-3 py-2 text-sm transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded-md px-3 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? "Création…" : "Ajouter"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page Timeline ─────────────────────────────────────────────────────────────

export default function Timeline() {
  const { incidentId, incident } = useCurrentIncident();
  const hasPermission = useAppStore((s) => s.hasPermission);
  const canWrite = hasPermission("TIMELINE", "WRITE");
  const [exporting, setExporting] = useState(false);

  const [filters, setFilters] = useState<Record<string, string>>({
    occurredAt: "",
    title: "",
    type: "",
    assetName: "",
    ipAddress: "",
    affectedUser: "",
    description: "",
  });
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalSubmitting, setModalSubmitting] = useState(false);

  // ── Queries ───────────────────────────────────────────────────────────────
  const {
    data,
    loading,
    error: queryError,
    subscribeToMore,
  } = useQuery<{ timelineEvents: GqlTimelineEvent[] }>(TIMELINE_EVENTS_QUERY, {
    variables: { incidentId },
    skip: !incidentId,
    fetchPolicy: "cache-and-network",
  });

  // ── Subscription temps réel ───────────────────────────────────────────────
  useEffect(() => {
    if (!incidentId) return;
    const unsub = subscribeToMore<{ timelineEventAdded: GqlTimelineEvent }>({
      document: TIMELINE_EVENT_ADDED_SUBSCRIPTION,
      variables: { incidentId },
      updateQuery(prev, { subscriptionData }) {
        const newEvent = subscriptionData.data?.timelineEventAdded;
        if (!newEvent) return prev;
        if (prev.timelineEvents.some((e) => e.id === newEvent.id)) return prev;
        return { timelineEvents: [newEvent, ...prev.timelineEvents] };
      },
    });
    return unsub;
  }, [incidentId, subscribeToMore]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const [createTimelineEvent] = useMutation<{ createTimelineEvent: GqlTimelineEvent }>(
    CREATE_TIMELINE_EVENT_MUTATION,
    {
      update(cache, { data: result }) {
        if (!result?.createTimelineEvent) return;
        cache.updateQuery(
          { query: TIMELINE_EVENTS_QUERY, variables: { incidentId } },
          (prev) => {
            if (!prev) return { timelineEvents: [result.createTimelineEvent] };
            if (prev.timelineEvents.some((e: GqlTimelineEvent) => e.id === result.createTimelineEvent.id))
              return prev;
            return { timelineEvents: [result.createTimelineEvent, ...prev.timelineEvents] };
          }
        );
      },
    }
  );

  const [deleteTimelineEvent] = useMutation<{ deleteTimelineEvent: boolean }, { id: string }>(
    DELETE_TIMELINE_EVENT_MUTATION,
    {
      update(cache, _result, { variables }) {
        if (!variables?.id) return;
        cache.updateQuery(
          { query: TIMELINE_EVENTS_QUERY, variables: { incidentId } },
          (prev) => {
            if (!prev) return prev;
            return {
              timelineEvents: prev.timelineEvents.filter(
                (e: GqlTimelineEvent) => e.id !== variables.id
              ),
            };
          }
        );
      },
    }
  );

  // ── Handlers ──────────────────────────────────────────────────────────────
  async function handleCreateEvent(form: NewEventForm) {
    setModalError(null);
    setModalSubmitting(true);
    try {
      await createTimelineEvent({
        variables: {
          incidentId,
          input: {
            type: form.type,
            title: form.title,
            description: form.description || null,
            occurredAt: new Date(form.occurredAt).toISOString(),
            ipAddress: form.ipAddress || null,
            assetName: form.assetName || null,
            affectedUser: form.affectedUser || null,
          },
        },
      });
      setShowModal(false);
    } catch (err: unknown) {
      const msg =
        (err as { graphQLErrors?: Array<{ message: string }> })?.graphQLErrors?.[0]?.message ??
        "Erreur lors de la création";
      setModalError(msg);
    } finally {
      setModalSubmitting(false);
    }
  }

  function toggleFilter(column: string) {
    const next = new Set(activeFilters);
    if (next.has(column)) {
      next.delete(column);
      setFilters((prev) => ({ ...prev, [column]: "" }));
    } else {
      next.add(column);
    }
    setActiveFilters(next);
  }

  function clearFilter(column: string) {
    const next = new Set(activeFilters);
    next.delete(column);
    setActiveFilters(next);
    setFilters((prev) => ({ ...prev, [column]: "" }));
  }

  // ── Données triées et filtrées ────────────────────────────────────────────
  const events = [...(data?.timelineEvents ?? [])].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
  );

  const filteredEvents = events.filter((event) =>
    Object.entries(filters).every(([key, value]) => {
      if (!value) return true;
      const v = (() => {
        switch (key) {
          case "occurredAt":
            return new Date(event.occurredAt).toLocaleString("fr-FR");
          case "title": return event.title;
          case "type": return EVENT_TYPE_LABELS[event.type];
          case "assetName": return event.assetName ?? "";
          case "ipAddress": return event.ipAddress ?? "";
          case "affectedUser": return event.affectedUser ?? "";
          case "description": return event.description ?? "";
          default: return "";
        }
      })();
      return v.toLowerCase().includes(value.toLowerCase());
    })
  );

  const activeFilterCount = Object.values(filters).filter((v) => v !== "").length;

  const columns = [
    { key: "occurredAt", label: "Timestamp", width: "w-40" },
    { key: "title", label: "Événement", width: "" },
    { key: "type", label: "Type", width: "w-36" },
    { key: "assetName", label: "Asset", width: "w-36" },
    { key: "ipAddress", label: "Adresse IP", width: "w-32" },
    { key: "affectedUser", label: "Utilisateur", width: "w-40" },
    { key: "description", label: "Description", width: "w-48" },
    { key: "_actions", label: "", width: "w-12" },
  ];

  return (
    <div className="p-8 bg-[#0f1116] min-h-screen">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl mb-2 text-white">Timeline — Cellule opérationnelle</h1>
          <p className="text-gray-400">Chronologie détaillée des événements opérationnels</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              if (!incidentId || exporting) return;
              setExporting(true);
              try { await exportXlsx(incidentId, incident?.name ?? incidentId); }
              catch (e) { alert(e instanceof Error ? e.message : "Erreur export"); }
              finally { setExporting(false); }
            }}
            disabled={exporting}
            className="flex items-center gap-2 bg-[#1e2229] hover:bg-[#2a2e39] text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            title="Exporter le rapport complet en Excel"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {exporting ? "Export…" : "Exporter Excel"}
          </button>
          {canWrite && (
            <button
              onClick={() => { setShowModal(true); setModalError(null); }}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Ajouter un événement
            </button>
          )}
        </div>
      </div>

      {/* Filtres actifs */}
      {activeFilterCount > 0 && (
        <div className="mb-6 bg-[#13151a] border border-[#1e2229] rounded-lg p-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-400">Filtres actifs :</span>
            {Object.entries(filters)
              .filter(([, value]) => value !== "")
              .map(([key, value]) => (
                <span
                  key={key}
                  className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/10 text-blue-400 text-sm rounded-lg"
                >
                  <span className="capitalize">{columns.find((c) => c.key === key)?.label ?? key} :</span>
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

      {/* États */}
      {loading && !data && (
        <div className="flex items-center justify-center py-12 text-gray-500 gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Chargement…</span>
        </div>
      )}
      {queryError && (
        <div className="bg-red-400/10 border border-red-400/20 rounded-lg p-4 text-red-400 text-sm mb-4">
          {queryError.message}
        </div>
      )}

      {/* Tableau */}
      <div className="bg-[#13151a] border border-[#1e2229] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#0a0b0d] border-b border-[#1e2229]">
              <tr>
                {columns.map((column) => (
                  <th key={column.key} className={`px-4 py-3 text-left ${column.width}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-400 uppercase tracking-wider">
                        {column.label}
                      </span>
                      {column.key !== "_actions" && (
                        <button
                          onClick={() => toggleFilter(column.key)}
                          className={`p-1 rounded transition-colors ${
                            activeFilters.has(column.key)
                              ? "bg-blue-500/20 text-blue-400"
                              : "hover:bg-[#1e2229] text-gray-500"
                          }`}
                        >
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    {activeFilters.has(column.key) && (
                      <input
                        type="text"
                        value={filters[column.key] || ""}
                        onChange={(e) =>
                          setFilters((prev) => ({ ...prev, [column.key]: e.target.value }))
                        }
                        placeholder={`Filtrer…`}
                        className="mt-2 w-full px-2 py-1 bg-[#13151a] border border-[#1e2229] rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                      />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2229]">
              {filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12 text-center text-gray-500">
                    {events.length === 0
                      ? "Aucun événement — ajoutez-en un."
                      : "Aucun événement correspondant aux filtres."}
                  </td>
                </tr>
              ) : (
                filteredEvents.map((event) => (
                  <tr key={event.id} className="hover:bg-[#1a1d24] transition-colors">
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-white">
                      {new Date(event.occurredAt).toLocaleString("fr-FR", {
                        day: "2-digit", month: "2-digit", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm text-gray-200 font-medium">{event.title}</p>
                      {event.actor && (
                        <p className="text-xs text-blue-400 mt-0.5">
                          {event.actor.firstName} {event.actor.lastName}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded ${EVENT_TYPE_COLORS[event.type]}`}>
                        {EVENT_TYPE_LABELS[event.type]}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-300">
                      {event.assetName ?? <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className="text-sm font-mono text-green-400">
                        {event.ipAddress ?? <span className="text-gray-600">—</span>}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-300">
                      {event.affectedUser ?? <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-400">
                      {event.description ?? <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-4">
                      {canWrite && (
                        <button
                          onClick={() => {
                            if (confirm("Supprimer cet événement ?"))
                              deleteTimelineEvent({ variables: { id: event.id } });
                          }}
                          className="p-1 hover:bg-red-500/10 rounded transition-colors text-gray-500 hover:text-red-400"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {data && (
          <div className="px-4 py-3 border-t border-[#1e2229] text-xs text-gray-500">
            {filteredEvents.length} événement{filteredEvents.length > 1 ? "s" : ""}
            {activeFilterCount > 0 && ` sur ${events.length}`}
          </div>
        )}
      </div>

      {/* Modal ajout */}
      {showModal && (
        <AddEventModal
          onClose={() => setShowModal(false)}
          onSubmit={handleCreateEvent}
          submitting={modalSubmitting}
          error={modalError}
        />
      )}
    </div>
  );
}
