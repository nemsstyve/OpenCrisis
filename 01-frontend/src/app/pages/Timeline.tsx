import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { timelineEventSchema } from "../../lib/formSchemas";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ChevronDown, X, Plus, Loader2, Trash2, Download, Pencil, Link, Unlink, Search } from "lucide-react";
import { exportXlsx } from "../../lib/exportUtils";
import { useQuery, useMutation, useLazyQuery } from "@apollo/client";
import {
  TIMELINE_EVENTS_QUERY,
  CREATE_TIMELINE_EVENT_MUTATION,
  UPDATE_TIMELINE_EVENT_MUTATION,
  DELETE_TIMELINE_EVENT_MUTATION,
  TIMELINE_EVENT_ADDED_SUBSCRIPTION,
  SEARCH_OPENCTI_QUERY,
  OPENCTI_STATUS_QUERY,
  LINK_OPENCTI_MUTATION,
  UNLINK_OPENCTI_MUTATION,
} from "../../graphql/timeline";
import { useCurrentIncident } from "../../hooks/useCurrentIncident";
import { useAppStore } from "../../store/useAppStore";
import { Skeleton } from "../components/ui/skeleton";
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
  occurredAt: new Date().toISOString().slice(0, 16),
  ipAddress: "",
  assetName: "",
  affectedUser: "",
};

interface EventModalProps {
  onClose: () => void;
  onSubmit: (data: NewEventForm) => Promise<void>;
  submitting: boolean;
  error: string | null;
  initial?: NewEventForm;
  mode: "create" | "edit";
}

function EventModal({ onClose, onSubmit, submitting, error, initial, mode }: EventModalProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<NewEventForm>({
    resolver: zodResolver(timelineEventSchema),
    defaultValues: initial ?? EMPTY_FORM,
  });

  const inputCls =
    "w-full bg-[#0a0b0d] border border-[#1e2229] rounded-md px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors";
  const errCls = "text-red-400 text-xs mt-1";

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-[#13151a] border border-[#1e2229] rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e2229]">
          <h2 className="text-white font-medium">
            {mode === "edit" ? "Modifier l'événement" : "Ajouter un événement"}
          </h2>
          <button onClick={onClose} aria-label="Fermer" className="text-gray-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4" noValidate>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Type *</label>
            <select {...register("type")} className={inputCls}>
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>{EVENT_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Titre *</label>
            <input
              {...register("title")}
              className={inputCls}
              placeholder="Ex : Détection d'un accès non autorisé"
            />
            {errors.title && <p className={errCls}>{errors.title.message}</p>}
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Date / Heure *</label>
            <input
              type="datetime-local"
              {...register("occurredAt")}
              className={inputCls}
            />
            {errors.occurredAt && <p className={errCls}>{errors.occurredAt.message}</p>}
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Description</label>
            <textarea
              {...register("description")}
              rows={3}
              className="w-full bg-[#0a0b0d] border border-[#1e2229] rounded-md px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors resize-none"
              placeholder="Description détaillée de l'événement…"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Asset</label>
              <input
                {...register("assetName")}
                className={inputCls}
                placeholder="Serveur-DB-01"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Adresse IP</label>
              <input
                {...register("ipAddress")}
                className={inputCls}
                placeholder="10.0.1.15"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Utilisateur affecté</label>
            <input
              {...register("affectedUser")}
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
              {submitting ? "Enregistrement…" : mode === "edit" ? "Enregistrer" : "Ajouter"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── OpenCTI ───────────────────────────────────────────────────────────────────

interface OpenCTIEntity {
  id: string;
  name: string;
  entity_type: string;
  description?: string | null;
}

interface OpenCTIModalProps {
  event: GqlTimelineEvent;
  onClose: () => void;
  onLink: (entity: OpenCTIEntity) => Promise<void>;
  onUnlink: () => Promise<void>;
}

function OpenCTIModal({ event, onClose, onLink, onUnlink }: OpenCTIModalProps) {
  const [searchQuery, setSearchQuery] = useState(event.ipAddress ?? event.assetName ?? "");
  const [linking, setLinking] = useState(false);
  const [searchOpenCTI, { data: searchData, loading: searching }] = useLazyQuery<{
    searchOpenCTI: OpenCTIEntity[];
  }>(SEARCH_OPENCTI_QUERY);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (searchQuery.trim().length < 2) return;
    searchOpenCTI({ variables: { query: searchQuery.trim() } });
  }

  async function handleLink(entity: OpenCTIEntity) {
    setLinking(true);
    try { await onLink(entity); onClose(); } finally { setLinking(false); }
  }

  async function handleUnlink() {
    setLinking(true);
    try { await onUnlink(); onClose(); } finally { setLinking(false); }
  }

  const results = searchData?.searchOpenCTI ?? [];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-[#13151a] border border-[#1e2229] rounded-lg w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e2229]">
          <div>
            <h2 className="text-white font-medium flex items-center gap-2">
              <span className="text-orange-400">&#x2B21;</span> Lier à OpenCTI
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">{event.title}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {event.openctiEntityId && (
          <div className="mx-6 mt-4 p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-orange-400 uppercase tracking-wider mb-0.5">Entité liée</p>
                <p className="text-sm text-white">{event.openctiEntityType}</p>
                <p className="text-xs text-gray-400 font-mono truncate">{event.openctiEntityId}</p>
              </div>
              <button
                onClick={handleUnlink}
                disabled={linking}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded text-xs transition-colors disabled:opacity-50"
              >
                <Unlink className="w-3 h-3" /> Délier
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSearch} className="px-6 pt-4 pb-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="IP, domaine, hash, malware…"
              className="flex-1 bg-[#0a0b0d] border border-[#1e2229] rounded-md px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-orange-500 transition-colors"
            />
            <button
              type="submit"
              disabled={searching || searchQuery.trim().length < 2}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-md text-sm transition-colors disabled:opacity-50"
            >
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Chercher
            </button>
          </div>
        </form>

        <div className="flex-1 overflow-y-auto px-6 pb-4">
          {searching && (
            <div className="flex items-center justify-center py-8 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Recherche dans OpenCTI…
            </div>
          )}
          {!searching && results.length === 0 && searchData && (
            <p className="text-center text-gray-500 py-8 text-sm">
              Aucune entité trouvée pour &quot;{searchQuery}&quot;
            </p>
          )}
          {!searching && results.length > 0 && (
            <div className="space-y-2 mt-2">
              {results.map((entity) => (
                <button
                  key={entity.id}
                  onClick={() => handleLink(entity)}
                  disabled={linking}
                  className="w-full text-left p-3 bg-[#0a0b0d] hover:bg-[#1e2229] border border-[#1e2229] hover:border-orange-500/40 rounded-lg transition-colors disabled:opacity-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm text-white font-medium truncate">{entity.name}</p>
                      <p className="text-xs text-orange-400 mt-0.5">{entity.entity_type}</p>
                      {entity.description && (
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{entity.description}</p>
                      )}
                    </div>
                    <Link className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                  </div>
                </button>
              ))}
            </div>
          )}
          {!searchData && !searching && (
            <p className="text-center text-gray-600 py-8 text-sm">
              Lancez une recherche pour trouver des entités OpenCTI
            </p>
          )}
        </div>
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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [openctiEvent, setOpenctiEvent] = useState<GqlTimelineEvent | null>(null);

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
  const [editing, setEditing] = useState<GqlTimelineEvent | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalSubmitting, setModalSubmitting] = useState(false);

  // ── OpenCTI status ────────────────────────────────────────────────────────
  const { data: statusData } = useQuery<{ openctiStatus: boolean }>(OPENCTI_STATUS_QUERY);
  const openctiEnabled = statusData?.openctiStatus ?? false;

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

  const [updateTimelineEvent] = useMutation<{ updateTimelineEvent: GqlTimelineEvent }>(
    UPDATE_TIMELINE_EVENT_MUTATION
  );

  const [linkToOpenCTI] = useMutation(LINK_OPENCTI_MUTATION, {
    refetchQueries: [{ query: TIMELINE_EVENTS_QUERY, variables: { incidentId } }],
  });

  const [unlinkFromOpenCTI] = useMutation(UNLINK_OPENCTI_MUTATION, {
    refetchQueries: [{ query: TIMELINE_EVENTS_QUERY, variables: { incidentId } }],
  });

  // ── Handlers ──────────────────────────────────────────────────────────────
  function eventToForm(event: GqlTimelineEvent): NewEventForm {
    return {
      type: event.type,
      title: event.title,
      description: event.description ?? "",
      occurredAt: new Date(event.occurredAt).toISOString().slice(0, 16),
      ipAddress: event.ipAddress ?? "",
      assetName: event.assetName ?? "",
      affectedUser: event.affectedUser ?? "",
    };
  }

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

  async function handleUpdateEvent(form: NewEventForm) {
    if (!editing) return;
    setModalError(null);
    setModalSubmitting(true);
    try {
      await updateTimelineEvent({
        variables: {
          id: editing.id,
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
      setEditing(null);
    } catch (err: unknown) {
      const msg =
        (err as { graphQLErrors?: Array<{ message: string }> })?.graphQLErrors?.[0]?.message ??
        "Erreur lors de la modification";
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
    { key: "_actions", label: "", width: "w-20" },
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
                    aria-label={`Retirer le filtre ${columns.find((c) => c.key === key)?.label ?? key}`}
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
                  <th key={column.key} scope="col" className={`px-4 py-3 text-left ${column.width}${column.key === "_actions" ? " sr-only" : ""}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-400 uppercase tracking-wider">
                        {column.label}
                      </span>
                      {column.key !== "_actions" && (
                        <button
                          onClick={() => toggleFilter(column.key)}
                          aria-label={`Filtrer par ${column.label}`}
                          aria-pressed={activeFilters.has(column.key)}
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
                        aria-label={`Valeur du filtre ${column.label}`}
                        placeholder="Filtrer…"
                        className="mt-2 w-full px-2 py-1 bg-[#13151a] border border-[#1e2229] rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                      />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2229]">
              {loading && !data ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`sk-${i}`} role="status" aria-label="Chargement">
                    {columns.map((column) => (
                      <td key={column.key} className="px-4 py-4">
                        <Skeleton className="h-4 w-full bg-[#1e2229]" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredEvents.length === 0 ? (
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
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { setEditing(event); setModalError(null); }}
                            className="p-1 hover:bg-blue-500/10 rounded transition-colors text-gray-500 hover:text-blue-400"
                            title="Modifier"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          {openctiEnabled && (
                            <button
                              onClick={() => setOpenctiEvent(event)}
                              className={`p-1 rounded transition-colors ${
                                event.openctiEntityId
                                  ? "text-orange-400 hover:bg-orange-500/10"
                                  : "text-gray-500 hover:bg-[#1e2229] hover:text-orange-400"
                              }`}
                              title={event.openctiEntityId ? `Lié : ${event.openctiEntityType}` : "Lier à OpenCTI"}
                            >
                              <Link className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => setConfirmDeleteId(event.id)}
                            className="p-1 hover:bg-red-500/10 rounded transition-colors text-gray-500 hover:text-red-400"
                            title="Supprimer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
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
        <EventModal
          mode="create"
          onClose={() => setShowModal(false)}
          onSubmit={handleCreateEvent}
          submitting={modalSubmitting}
          error={modalError}
        />
      )}

      {/* Modal édition */}
      {editing && (
        <EventModal
          mode="edit"
          initial={eventToForm(editing)}
          onClose={() => setEditing(null)}
          onSubmit={handleUpdateEvent}
          submitting={modalSubmitting}
          error={modalError}
        />
      )}

      {/* Modal OpenCTI */}
      {openctiEvent && (
        <OpenCTIModal
          event={openctiEvent}
          onClose={() => setOpenctiEvent(null)}
          onLink={async (entity: OpenCTIEntity) => {
            await linkToOpenCTI({
              variables: {
                eventId: openctiEvent.id,
                openctiEntityId: entity.id,
                openctiEntityType: entity.entity_type,
              },
            });
          }}
          onUnlink={async () => {
            await unlinkFromOpenCTI({ variables: { eventId: openctiEvent.id } });
          }}
        />
      )}

      <ConfirmDialog
        open={!!confirmDeleteId}
        description="Supprimer cet événement de la timeline ?"
        onConfirm={() => {
          if (confirmDeleteId) deleteTimelineEvent({ variables: { id: confirmDeleteId } });
          setConfirmDeleteId(null);
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
