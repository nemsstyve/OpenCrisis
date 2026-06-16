import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { timelineEventSchema } from "../../lib/formSchemas";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { FormModal } from "../components/FormModal";
import { Checkbox } from "../components/ui/checkbox";
import {
  ChevronDown, X, Plus, Loader2, Trash2, Download, Pencil,
  ArrowUpDown, ArrowUp, ArrowDown, Search, Copy,
} from "lucide-react";
import { exportXlsx } from "../../lib/exportUtils";
import { useQuery, useMutation } from "@apollo/client";
import {
  TIMELINE_EVENTS_QUERY,
  CREATE_TIMELINE_EVENT_MUTATION,
  UPDATE_TIMELINE_EVENT_MUTATION,
  DELETE_TIMELINE_EVENT_MUTATION,
  TIMELINE_EVENT_ADDED_SUBSCRIPTION,
} from "../../graphql/timeline";
import { useCurrentIncident } from "../../hooks/useCurrentIncident";
import { useAppStore } from "../../store/useAppStore";
import { Skeleton } from "../components/ui/skeleton";
import type { GqlTimelineEvent, GqlTimelineEventType } from "../../types/generated";

// ── Types d'événements ────────────────────────────────────────────────────────
const EVENT_TYPES: GqlTimelineEventType[] = [
  "DETECTION", "ACTION", "DECISION", "COMMUNICATION", "ESCALATION", "RESOLUTION",
];

const EVENT_TYPE_LABELS: Record<GqlTimelineEventType, string> = {
  DETECTION: "Détection",
  ACTION: "Action",
  DECISION: "Décision",
  COMMUNICATION: "Communication",
  ESCALATION: "Escalade",
  RESOLUTION: "Résolution",
};

const EVENT_TYPE_COLORS: Record<GqlTimelineEventType, string> = {
  DETECTION: "bg-red-500/10 text-red-400",
  ACTION: "bg-blue-500/10 text-blue-400",
  DECISION: "bg-purple-500/10 text-purple-400",
  COMMUNICATION: "bg-yellow-500/10 text-yellow-400",
  ESCALATION: "bg-orange-500/10 text-orange-400",
  RESOLUTION: "bg-green-500/10 text-green-400",
};

// ── Convertit un instant UTC en chaîne locale pour <input type="datetime-local"> ──
// `.toISOString()` extrait les composants UTC, pas locaux → décalage si UTC≠local.
// On utilise les getters locaux du Date pour éviter le bug de timezone.
function toDatetimeLocal(iso: string | Date): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Formulaire d'ajout d'événement ────────────────────────────────────────────
interface NewEventForm {
  type: GqlTimelineEventType;
  title: string;
  description: string;
  occurredAt: string;
  isFirstDetection: boolean;
  ipAddress: string;
  assetName: string;
  affectedUser: string;
  ioc: string;
}

const EMPTY_FORM: NewEventForm = {
  type: "DETECTION",
  title: "",
  description: "",
  occurredAt: toDatetimeLocal(new Date()),
  isFirstDetection: false,
  ipAddress: "",
  assetName: "",
  affectedUser: "",
  ioc: "",
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
    watch,
    control,
    formState: { errors },
  } = useForm<NewEventForm>({
    resolver: zodResolver(timelineEventSchema),
    defaultValues: initial ?? EMPTY_FORM,
  });

  const isDetection = watch("type") === "DETECTION";

  const inputCls =
    "w-full bg-[#0a0b0d] border border-[#1e2229] rounded-md px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors";
  const errCls = "text-red-400 text-xs mt-1";

  return (
    <FormModal
      open
      onClose={onClose}
      title={mode === "edit" ? "Modifier l'événement" : "Ajouter un événement"}
      contentClassName="sm:max-w-lg"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4" noValidate>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Type *</label>
            <select {...register("type")} className={inputCls}>
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>{EVENT_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>

          {isDetection && (
            <div className="flex items-center gap-2">
              <Controller
                name="isFirstDetection"
                control={control}
                render={({ field }) => (
                  <Checkbox
                    id="isFirstDetection"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                )}
              />
              <label htmlFor="isFirstDetection" className="text-sm text-gray-400">
                Première Détection
              </label>
            </div>
          )}

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

          <div>
            <label className="block text-sm text-gray-400 mb-1.5">IOC</label>
            <input
              {...register("ioc")}
              className={inputCls}
              placeholder="Hash, domaine, IP…"
            />
            {errors.ioc && <p className={errCls}>{errors.ioc.message}</p>}
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
    </FormModal>
  );
}

// ── Bouton copie dans le presse-papier ───────────────────────────────────────
function CopyCell({ value }: { value: string }) {
  return (
    <div className="group flex items-center gap-1">
      <span>{value}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(value);
          toast.success("Copié !");
        }}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-white/10 rounded"
        aria-label="Copier"
      >
        <Copy className="w-3 h-3 text-gray-400" />
      </button>
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
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [globalSearch, setGlobalSearch] = useState("");

  const [filters, setFilters] = useState<Record<string, string>>({
    occurredAt: "",
    title: "",
    type: "",
    assetName: "",
    ipAddress: "",
    affectedUser: "",
    description: "",
    ioc: "",
  });
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<GqlTimelineEvent | null>(null);
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

  const [updateTimelineEvent] = useMutation<{ updateTimelineEvent: GqlTimelineEvent }>(
    UPDATE_TIMELINE_EVENT_MUTATION
  );

  // ── Handlers ──────────────────────────────────────────────────────────────
  function eventToForm(event: GqlTimelineEvent): NewEventForm {
    return {
      type: event.type,
      title: event.title,
      description: event.description ?? "",
      occurredAt: toDatetimeLocal(event.occurredAt),
      isFirstDetection: event.isFirstDetection,
      ipAddress: event.ipAddress ?? "",
      assetName: event.assetName ?? "",
      affectedUser: event.affectedUser ?? "",
      ioc: event.ioc ?? "",
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
            isFirstDetection: form.type === "DETECTION" ? form.isFirstDetection : false,
            ipAddress: form.ipAddress || null,
            assetName: form.assetName || null,
            affectedUser: form.affectedUser || null,
            ioc: form.ioc || null,
          },
        },
        ...(form.type === "DETECTION" && form.isFirstDetection
          ? { refetchQueries: [{ query: TIMELINE_EVENTS_QUERY, variables: { incidentId } }] }
          : {}),
      });
      toast.success("Événement ajouté");
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
            isFirstDetection: form.type === "DETECTION" ? form.isFirstDetection : false,
            ipAddress: form.ipAddress || null,
            assetName: form.assetName || null,
            affectedUser: form.affectedUser || null,
            ioc: form.ioc || null,
          },
        },
        ...(form.type === "DETECTION" && form.isFirstDetection
          ? { refetchQueries: [{ query: TIMELINE_EVENTS_QUERY, variables: { incidentId } }] }
          : {}),
      });
      toast.success("Événement modifié");
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
      if (column === "occurredAt") setDateRange({ from: "", to: "" });
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
    if (column === "occurredAt") setDateRange({ from: "", to: "" });
  }

  // ── Données triées et filtrées ────────────────────────────────────────────
  const events = [...(data?.timelineEvents ?? [])].sort((a, b) => {
    const diff = new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime();
    return sortDirection === "desc" ? -diff : diff;
  });

  const filteredEvents = events.filter((event) => {
    // Recherche globale
    if (globalSearch) {
      const needle = globalSearch.toLowerCase();
      const haystack = [
        event.title,
        event.description ?? "",
        event.assetName ?? "",
        event.ipAddress ?? "",
        event.affectedUser ?? "",
        event.ioc ?? "",
      ].join(" ").toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    // Filtres par colonne
    return Object.entries(filters).every(([key, value]) => {
      if (!value && !(key === "occurredAt" && (dateRange.from || dateRange.to))) return true;
      switch (key) {
        case "occurredAt": {
          const t = new Date(event.occurredAt).getTime();
          const from = dateRange.from ? new Date(dateRange.from).getTime() : -Infinity;
          const to = dateRange.to ? new Date(dateRange.to + "T23:59:59").getTime() : Infinity;
          return t >= from && t <= to;
        }
        case "type":
          return !value || event.type === value;
        case "title": return event.title.toLowerCase().includes(value.toLowerCase());
        case "assetName": return (event.assetName ?? "").toLowerCase().includes(value.toLowerCase());
        case "ipAddress": return (event.ipAddress ?? "").toLowerCase().includes(value.toLowerCase());
        case "affectedUser": return (event.affectedUser ?? "").toLowerCase().includes(value.toLowerCase());
        case "description": return (event.description ?? "").toLowerCase().includes(value.toLowerCase());
        case "ioc": return (event.ioc ?? "").toLowerCase().includes(value.toLowerCase());
        default: return true;
      }
    });
  });

  const isDateRangeActive = dateRange.from !== "" || dateRange.to !== "";
  const activeFilterCount =
    Object.entries(filters).filter(([k, v]) => k !== "occurredAt" && v !== "").length +
    (isDateRangeActive ? 1 : 0);
  const totalActiveCount = activeFilterCount + (globalSearch ? 1 : 0);

  const columns = [
    { key: "occurredAt", label: "Timestamp", width: "w-36" },
    { key: "title", label: "Événement", width: "" },
    { key: "type", label: "Type", width: "w-28" },
    { key: "assetName", label: "Asset", width: "w-24" },
    { key: "ipAddress", label: "IP", width: "w-28" },
    { key: "ioc", label: "IOC", width: "w-40" },
    { key: "affectedUser", label: "Utilisateur", width: "w-24" },
    { key: "description", label: "Description", width: "w-32" },
    ...(canWrite ? [{ key: "_actions", label: "", width: "w-14" }] : []),
  ];

  const filterInputCls =
    "mt-2 w-full px-2 py-1 bg-[#13151a] border border-[#1e2229] rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500";

  return (
    <div className="p-8 bg-[#0f1116] min-h-screen">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl mb-2 text-white">Timeline — Cellule opérationnelle</h1>
          <p className="text-gray-400">Chronologie détaillée des événements opérationnels</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={async () => {
              if (!incidentId || exporting) return;
              setExporting(true);
              try { await exportXlsx(incidentId, incident?.name ?? incidentId); }
              catch (e) { toast.error(e instanceof Error ? e.message : "Erreur lors de l'export"); }
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

      {/* Recherche globale */}
      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
        <input
          type="text"
          value={globalSearch}
          onChange={(e) => setGlobalSearch(e.target.value)}
          placeholder="Rechercher dans tous les champs…"
          className="w-full pl-9 pr-4 py-2 bg-[#13151a] border border-[#1e2229] rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
        />
        {globalSearch && (
          <button
            onClick={() => setGlobalSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Filtres actifs */}
      {totalActiveCount > 0 && (
        <div className="mb-6 bg-[#13151a] border border-[#1e2229] rounded-lg p-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-400">Filtres actifs :</span>
            {globalSearch && (
              <span className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/10 text-blue-400 text-sm rounded-lg">
                <span>Recherche :</span>
                <span className="font-medium">{globalSearch}</span>
                <button
                  onClick={() => setGlobalSearch("")}
                  aria-label="Retirer la recherche globale"
                  className="hover:bg-blue-500/20 rounded p-0.5 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {isDateRangeActive && (
              <span className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/10 text-blue-400 text-sm rounded-lg">
                <span>Timestamp :</span>
                <span className="font-medium">
                  {dateRange.from || "…"} → {dateRange.to || "…"}
                </span>
                <button
                  onClick={() => clearFilter("occurredAt")}
                  aria-label="Retirer le filtre Timestamp"
                  className="hover:bg-blue-500/20 rounded p-0.5 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {Object.entries(filters)
              .filter(([key, value]) => key !== "occurredAt" && value !== "")
              .map(([key, value]) => (
                <span
                  key={key}
                  className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/10 text-blue-400 text-sm rounded-lg"
                >
                  <span className="capitalize">{columns.find((c) => c.key === key)?.label ?? key} :</span>
                  <span className="font-medium">
                    {key === "type" ? EVENT_TYPE_LABELS[value as GqlTimelineEventType] ?? value : value}
                  </span>
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
          <table className="w-full table-fixed">
            <thead className="bg-[#0a0b0d] border-b border-[#1e2229]">
              <tr>
                {columns.map((column) => (
                  <th key={column.key} scope="col" className={`px-4 py-3 text-center ${column.width}`}>
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-sm text-gray-400 uppercase tracking-wider">
                        {column.label}
                      </span>
                      {/* Bouton de tri sur la colonne Timestamp */}
                      {column.key === "occurredAt" && (
                        <button
                          onClick={() => setSortDirection((d) => d === "desc" ? "asc" : "desc")}
                          aria-label={`Trier par ordre ${sortDirection === "desc" ? "croissant" : "décroissant"}`}
                          className="p-1 rounded transition-colors hover:bg-[#1e2229] text-blue-400"
                          title={sortDirection === "desc" ? "Plus récent en premier" : "Plus ancien en premier"}
                        >
                          {sortDirection === "desc"
                            ? <ArrowDown className="w-3 h-3" />
                            : <ArrowUp className="w-3 h-3" />}
                        </button>
                      )}
                      {/* Bouton filtre */}
                      {column.key !== "_actions" && (
                        <button
                          onClick={() => toggleFilter(column.key)}
                          aria-label={`Filtrer par ${column.label}`}
                          aria-pressed={activeFilters.has(column.key)}
                          className={`p-1 rounded transition-colors ${
                            activeFilters.has(column.key) || (column.key === "occurredAt" && isDateRangeActive)
                              ? "bg-blue-500/20 text-blue-400"
                              : "hover:bg-[#1e2229] text-gray-500"
                          }`}
                        >
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    {/* Contrôles de filtre inline */}
                    {activeFilters.has(column.key) && column.key === "occurredAt" && (
                      <div className="mt-2 flex gap-1">
                        <input
                          type="date"
                          value={dateRange.from}
                          onChange={(e) => setDateRange((r) => ({ ...r, from: e.target.value }))}
                          aria-label="Date de début"
                          className={filterInputCls}
                        />
                        <input
                          type="date"
                          value={dateRange.to}
                          onChange={(e) => setDateRange((r) => ({ ...r, to: e.target.value }))}
                          aria-label="Date de fin"
                          className={filterInputCls}
                        />
                      </div>
                    )}
                    {activeFilters.has(column.key) && column.key === "type" && (
                      <select
                        value={filters["type"]}
                        onChange={(e) => setFilters((prev) => ({ ...prev, type: e.target.value }))}
                        aria-label="Filtrer par type"
                        className={filterInputCls}
                      >
                        <option value="">Tous les types</option>
                        {EVENT_TYPES.map((t) => (
                          <option key={t} value={t}>{EVENT_TYPE_LABELS[t]}</option>
                        ))}
                      </select>
                    )}
                    {activeFilters.has(column.key) && column.key !== "occurredAt" && column.key !== "type" && column.key !== "_actions" && (
                      <input
                        type="text"
                        value={filters[column.key] || ""}
                        onChange={(e) =>
                          setFilters((prev) => ({ ...prev, [column.key]: e.target.value }))
                        }
                        aria-label={`Valeur du filtre ${column.label}`}
                        placeholder="Filtrer…"
                        className={filterInputCls}
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
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-white text-center">
                      {new Date(event.occurredAt).toLocaleString("fr-FR", {
                        day: "2-digit", month: "2-digit", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-4 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-sm text-gray-200 font-medium truncate" title={event.title}>{event.title}</p>
                        {event.isFirstDetection && (
                          <span className="shrink-0 px-1.5 py-0.5 text-xs rounded bg-red-500/10 text-red-400 whitespace-nowrap">
                            Première détection
                          </span>
                        )}
                      </div>
                      {event.actor && (
                        <p className="text-xs text-blue-400 mt-0.5 truncate">
                          {event.actor.firstName} {event.actor.lastName}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-center">
                      <span className={`px-2 py-1 text-xs rounded ${EVENT_TYPE_COLORS[event.type]}`}>
                        {EVENT_TYPE_LABELS[event.type]}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-300 text-center">
                      <p className="truncate" title={event.assetName ?? ""}>{event.assetName ?? <span className="text-gray-600">—</span>}</p>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-center">
                      {event.ipAddress
                        ? <span className="text-sm font-mono text-green-400"><CopyCell value={event.ipAddress} /></span>
                        : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-4 text-center">
                      {event.ioc
                        ? <span className="text-sm font-mono text-yellow-400 block truncate" title={event.ioc}><CopyCell value={event.ioc} /></span>
                        : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-300 text-center">
                      <p className="truncate" title={event.affectedUser ?? ""}>{event.affectedUser ?? <span className="text-gray-600">—</span>}</p>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-400">
                      <p className="truncate" title={event.description ?? ""}>{event.description ?? <span className="text-gray-600">—</span>}</p>
                    </td>
                    {canWrite && (
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1 justify-center">
                          <button
                            onClick={() => { setEditing(event); setModalError(null); }}
                            className="p-1 hover:bg-blue-500/10 rounded transition-colors text-gray-500 hover:text-blue-400"
                            title="Modifier"
                            aria-label="Modifier l'événement"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(event.id)}
                            className="p-1 hover:bg-red-500/10 rounded transition-colors text-gray-500 hover:text-red-400"
                            title="Supprimer"
                            aria-label="Supprimer l'événement"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {data && (
          <div className="px-4 py-3 border-t border-[#1e2229] text-xs text-gray-500">
            {filteredEvents.length} événement{filteredEvents.length > 1 ? "s" : ""}
            {totalActiveCount > 0 && ` sur ${events.length}`}
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
