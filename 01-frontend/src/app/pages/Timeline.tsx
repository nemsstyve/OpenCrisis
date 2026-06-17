import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { timelineEventSchema, IOC_TYPES, type IocType, type IocEntry } from "../../lib/formSchemas";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { FormModal } from "../components/FormModal";
import { Checkbox } from "../components/ui/checkbox";
import {
  Filter, SlidersHorizontal, X, Plus, Loader2, Trash2, Download, Pencil,
  ArrowUp, ArrowDown, Search, Copy,
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

// ── IOC — helpers ─────────────────────────────────────────────────────────────
const IOC_TYPE_LABELS: Record<IocType, string> = {
  hash: "Hash",
  domain: "Domaine",
  ip: "IP",
};

function parseIocs(raw: string | null | undefined): IocEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((e) => e.iocType && e.value)) return parsed as IocEntry[];
    return [{ iocType: "hash", value: raw }];
  } catch {
    return [{ iocType: "hash", value: raw }];
  }
}

function serializeIocs(iocs: IocEntry[]): string | null {
  if (!iocs || iocs.length === 0) return null;
  return JSON.stringify(iocs);
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
  iocs: IocEntry[];
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
  iocs: [],
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
  const { fields, append, remove } = useFieldArray({ control, name: "iocs" });

  const inputCls =
    "w-full bg-[#0a0b0d] border border-[#1e2229] rounded-md px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors";
  const errCls = "text-red-400 text-xs mt-1";

  return (
    <FormModal
      open
      onClose={onClose}
      title={mode === "edit" ? "Modifier l'événement" : "Ajouter un événement"}
      contentClassName="sm:max-w-2xl"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-3" noValidate>
        {/* ── Section Identification ─────────────────────────── */}
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider -mb-1">Identification</p>

        {/* Type — badges cliquables, 1 seule ligne */}
        <div>
          <label className="block text-sm text-gray-400 mb-2">Type *</label>
          <Controller
            name="type"
            control={control}
            render={({ field }) => (
              <div className="grid grid-cols-6 gap-2">
                {EVENT_TYPES.map((t) => {
                  const active = field.value === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => field.onChange(t)}
                      className={`py-1.5 rounded-full text-xs font-medium border transition-colors text-center ${
                        active
                          ? "bg-blue-600/20 border-blue-500 text-blue-400"
                          : "bg-transparent border-[#1e2229] text-gray-400 hover:border-gray-500 hover:text-gray-200"
                      }`}
                    >
                      {EVENT_TYPE_LABELS[t]}
                    </button>
                  );
                })}
              </div>
            )}
          />
        </div>

        {/* Première Détection — inline, uniquement si type=DETECTION */}
        {isDetection && (
          <div className="flex items-center gap-2.5 px-3 py-2 bg-red-500/5 border border-red-500/20 rounded-md">
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
            <label htmlFor="isFirstDetection" className="text-sm text-gray-300 cursor-pointer">
              Marquer comme première détection
            </label>
            <span className="ml-auto shrink-0 text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">
              Point de départ 72h CNIL
            </span>
          </div>
        )}

        {/* Titre | Date/Heure — 2 colonnes */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Titre *</label>
            <input
              {...register("title")}
              className={inputCls}
              placeholder="Ex : Accès non autorisé détecté"
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
        </div>

        {/* ── Section Contexte technique ──────────────────────── */}
        <div className="pt-2 border-t border-[#1e2229]">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Contexte technique</p>
        </div>

        {/* Utilisateur affecté — pleine largeur */}
        <div>
          <label className="block text-sm text-gray-400 mb-1.5">Utilisateur affecté</label>
          <input
            {...register("affectedUser")}
            className={inputCls}
            placeholder="jean.martin@company.com"
          />
        </div>

        {/* Asset | Adresse IP */}
        <div className="grid grid-cols-2 gap-3">
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

        {/* IOC — liste dynamique type + valeur */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-gray-400">IOC</label>
            <button
              type="button"
              onClick={() => append({ iocType: "hash", value: "" })}
              className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              <Plus className="w-3 h-3" /> Ajouter
            </button>
          </div>
          {fields.length === 0 ? (
            <p className="text-xs text-gray-600 italic px-1">Aucun IOC — cliquez sur Ajouter</p>
          ) : (
            <div className="space-y-2 max-h-32 overflow-y-auto pr-0.5">
              {fields.map((field, index) => (
                <div key={field.id} className="flex gap-2 items-center">
                  <select
                    {...register(`iocs.${index}.iocType`)}
                    className="w-24 shrink-0 bg-[#0a0b0d] border border-[#1e2229] rounded-md px-2 py-2 text-white text-xs focus:outline-none focus:border-blue-500 transition-colors"
                  >
                    {IOC_TYPES.map((t) => (
                      <option key={t} value={t}>{IOC_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                  <input
                    {...register(`iocs.${index}.value`)}
                    className="flex-1 bg-[#0a0b0d] border border-[#1e2229] rounded-md px-3 py-2 text-white text-xs font-mono placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
                    placeholder="Valeur…"
                  />
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="shrink-0 p-1.5 text-gray-600 hover:text-red-400 transition-colors rounded hover:bg-red-500/10"
                    aria-label="Supprimer cet IOC"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm text-gray-400 mb-1.5">Description</label>
          <textarea
            {...register("description")}
            rows={2}
            className="w-full bg-[#0a0b0d] border border-[#1e2229] rounded-md px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors resize-none"
            placeholder="Description détaillée de l'événement…"
          />
        </div>

        {error && (
          <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-1">
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
function CopyCell({ value, className }: { value: string; className?: string }) {
  return (
    <div className={`group inline-flex items-start gap-1 max-w-full ${className ?? ""}`}>
      <span className="break-words min-w-0">{value}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(value);
          toast.success("Copié !");
        }}
        className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-white/10 rounded"
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

  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    new Set(["occurredAt", "title", "type", "assetName", "ipAddress", "ioc", "affectedUser", "description", "_actions"])
  );
  const columnPickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!columnPickerOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (columnPickerRef.current && !columnPickerRef.current.contains(e.target as Node))
        setColumnPickerOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [columnPickerOpen]);
  const [typeFilters, setTypeFilters] = useState<Set<GqlTimelineEventType>>(new Set());
  const [dateRange, setDateRange] = useState({ from: "", fromTime: "00:00", to: "", toTime: "23:59" });
  const [textFilters, setTextFilters] = useState({
    title: "", assetName: "", ipAddress: "", ioc: "", affectedUser: "", description: "",
  });
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
      iocs: parseIocs(event.ioc),
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
            ioc: serializeIocs(form.iocs),
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
            ioc: serializeIocs(form.iocs),
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

  function toggleTypeFilter(t: GqlTimelineEventType) {
    setTypeFilters((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  }

  function clearAllFilters() {
    setTypeFilters(new Set());
    setDateRange({ from: "", fromTime: "00:00", to: "", toTime: "23:59" });
    setTextFilters({ title: "", assetName: "", ipAddress: "", ioc: "", affectedUser: "", description: "" });
  }

  // ── Données triées et filtrées ────────────────────────────────────────────
  const events = [...(data?.timelineEvents ?? [])].sort((a, b) => {
    const diff = new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime();
    return sortDirection === "desc" ? -diff : diff;
  });

  const filteredEvents = events.filter((event) => {
    if (globalSearch) {
      const needle = globalSearch.toLowerCase();
      const iocText = parseIocs(event.ioc).map((e) => e.value).join(" ");
      const haystack = [event.title, event.description ?? "", event.assetName ?? "", event.ipAddress ?? "", event.affectedUser ?? "", iocText, EVENT_TYPE_LABELS[event.type]].join(" ").toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    if (typeFilters.size > 0 && !typeFilters.has(event.type)) return false;
    if (dateRange.from || dateRange.to) {
      const t = new Date(event.occurredAt).getTime();
      const from = dateRange.from ? new Date(`${dateRange.from}T${dateRange.fromTime}`).getTime() : -Infinity;
      const to = dateRange.to ? new Date(`${dateRange.to}T${dateRange.toTime}:59`).getTime() : Infinity;
      if (t < from || t > to) return false;
    }
    const tf = textFilters;
    if (tf.title && !event.title.toLowerCase().includes(tf.title.toLowerCase())) return false;
    if (tf.assetName && !(event.assetName ?? "").toLowerCase().includes(tf.assetName.toLowerCase())) return false;
    if (tf.ipAddress && !(event.ipAddress ?? "").toLowerCase().includes(tf.ipAddress.toLowerCase())) return false;
    if (tf.ioc && !parseIocs(event.ioc).some((e) => e.value.toLowerCase().includes(tf.ioc.toLowerCase()))) return false;
    if (tf.affectedUser && !(event.affectedUser ?? "").toLowerCase().includes(tf.affectedUser.toLowerCase())) return false;
    if (tf.description && !(event.description ?? "").toLowerCase().includes(tf.description.toLowerCase())) return false;
    return true;
  });

  const isDateRangeActive = dateRange.from !== "" || dateRange.to !== "";
  const activeFilterCount =
    (typeFilters.size > 0 ? 1 : 0) +
    (isDateRangeActive ? 1 : 0) +
    Object.values(textFilters).filter(Boolean).length;
  const totalActiveCount = activeFilterCount + (globalSearch ? 1 : 0);

  const columns = [
    { key: "occurredAt", label: "Timestamp",   width: "w-40",  fixed: true  },
    { key: "title",      label: "Événement",   width: "",      fixed: false },
    { key: "type",       label: "Type",        width: "w-36",  fixed: true  },
    { key: "assetName",  label: "Asset",       width: "",      fixed: false },
    { key: "ipAddress",  label: "IP",          width: "w-36",  fixed: true  },
    { key: "ioc",        label: "IOC",         width: "",      fixed: false },
    { key: "affectedUser", label: "Utilisateur", width: "",    fixed: false },
    { key: "description",  label: "Description", width: "",    fixed: false },
    ...(canWrite ? [{ key: "_actions", label: "", width: "w-14", fixed: true }] : []),
  ];
  const displayedColumns = columns.filter((c) => visibleColumns.has(c.key));

  const filterInputCls =
    "w-full px-3 py-1.5 bg-[#0f1116] border border-[#1e2229] rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors";

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

      {/* Barre recherche + bouton filtres */}
      <div className="mb-3 flex gap-3 items-center">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
          <input
            type="text"
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            placeholder="Rechercher dans tous les champs…"
            className="w-full pl-9 pr-9 py-2 bg-[#13151a] border border-[#1e2229] rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
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
        <button
          onClick={() => setFilterPanelOpen((o) => !o)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors shrink-0 ${
            filterPanelOpen || activeFilterCount > 0
              ? "bg-blue-600/20 border-blue-500/50 text-blue-400"
              : "bg-[#13151a] border-[#1e2229] text-gray-400 hover:text-white hover:border-[#2a2e39]"
          }`}
          aria-expanded={filterPanelOpen}
        >
          <Filter className="w-4 h-4" />
          Filtres
          {activeFilterCount > 0 && (
            <span className="ml-0.5 px-1.5 py-0.5 text-xs rounded-full bg-blue-500 text-white leading-none">
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Sélecteur de colonnes */}
        <div className="relative shrink-0" ref={columnPickerRef}>
          <button
            onClick={() => setColumnPickerOpen((o) => !o)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
              columnPickerOpen
                ? "bg-blue-600/20 border-blue-500/50 text-blue-400"
                : "bg-[#13151a] border-[#1e2229] text-gray-400 hover:text-white hover:border-[#2a2e39]"
            }`}
            aria-expanded={columnPickerOpen}
            aria-label="Choisir les colonnes affichées"
          >
            <SlidersHorizontal className="w-4 h-4" />
            Colonnes
          </button>
          {columnPickerOpen && (
            <div className="absolute right-0 top-full mt-1 z-20 bg-[#13151a] border border-[#1e2229] rounded-lg p-3 shadow-xl min-w-44">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2 font-medium">Colonnes affichées</p>
              {columns.filter((c) => c.key !== "_actions").map((col) => (
                <label key={col.key} className="flex items-center gap-2.5 py-1.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={visibleColumns.has(col.key)}
                    onChange={() => {
                      setVisibleColumns((prev) => {
                        const next = new Set(prev);
                        if (next.has(col.key)) next.delete(col.key); else next.add(col.key);
                        return next;
                      });
                    }}
                    className="accent-blue-500 w-3.5 h-3.5 shrink-0"
                  />
                  <span className="text-sm text-gray-300 group-hover:text-white transition-colors">{col.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Panneau de filtres */}
      {filterPanelOpen && (
        <div className="mb-4 bg-[#13151a] border border-[#1e2229] rounded-lg p-4 space-y-4">
          {/* Type — multi-sélection */}
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Type</p>
            <div className="flex flex-wrap gap-2">
              {EVENT_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => toggleTypeFilter(t)}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                    typeFilters.has(t)
                      ? `${EVENT_TYPE_COLORS[t]} border-current`
                      : "border-[#1e2229] text-gray-500 hover:border-[#2a2e39] hover:text-gray-300"
                  }`}
                >
                  {EVENT_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Période */}
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Période</p>
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Date de début</label>
                <input
                  type="date"
                  value={dateRange.from}
                  onChange={(e) => setDateRange((r) => ({ ...r, from: e.target.value }))}
                  className={filterInputCls}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Heure de début</label>
                <input
                  type="time"
                  value={dateRange.fromTime}
                  onChange={(e) => setDateRange((r) => ({ ...r, fromTime: e.target.value }))}
                  disabled={!dateRange.from}
                  className={`${filterInputCls} disabled:opacity-30 disabled:cursor-not-allowed`}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Date de fin</label>
                <input
                  type="date"
                  value={dateRange.to}
                  onChange={(e) => setDateRange((r) => ({ ...r, to: e.target.value }))}
                  className={filterInputCls}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Heure de fin</label>
                <input
                  type="time"
                  value={dateRange.toTime}
                  onChange={(e) => setDateRange((r) => ({ ...r, toTime: e.target.value }))}
                  disabled={!dateRange.to}
                  className={`${filterInputCls} disabled:opacity-30 disabled:cursor-not-allowed`}
                />
              </div>
            </div>
          </div>

          {/* Champs texte */}
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Champs</p>
            <div className="grid grid-cols-3 gap-3">
              {([
                ["title", "Titre / Événement"],
                ["assetName", "Asset"],
                ["ipAddress", "IP"],
                ["ioc", "IOC"],
                ["affectedUser", "Utilisateur"],
                ["description", "Description"],
              ] as [keyof typeof textFilters, string][]).map(([key, label]) => (
                <div key={key}>
                  <label className="block text-xs text-gray-500 mb-1">{label}</label>
                  <input
                    type="text"
                    value={textFilters[key]}
                    onChange={(e) => setTextFilters((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder="Filtrer…"
                    className={filterInputCls}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Réinitialiser */}
          {activeFilterCount > 0 && (
            <div className="flex justify-end pt-1 border-t border-[#1e2229]">
              <button
                onClick={clearAllFilters}
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                Réinitialiser les filtres
              </button>
            </div>
          )}
        </div>
      )}

      {/* Résumé des filtres actifs */}
      {totalActiveCount > 0 && (
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500">Filtres actifs :</span>
          {globalSearch && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/10 text-blue-400 text-xs rounded-full">
              Recherche : <span className="font-medium">{globalSearch}</span>
              <button onClick={() => setGlobalSearch("")} aria-label="Retirer la recherche" className="hover:text-white"><X className="w-3 h-3" /></button>
            </span>
          )}
          {typeFilters.size > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/10 text-blue-400 text-xs rounded-full">
              Types : <span className="font-medium">{[...typeFilters].map((t) => EVENT_TYPE_LABELS[t]).join(", ")}</span>
              <button onClick={() => setTypeFilters(new Set())} aria-label="Retirer filtre type" className="hover:text-white"><X className="w-3 h-3" /></button>
            </span>
          )}
          {isDateRangeActive && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/10 text-blue-400 text-xs rounded-full">
              Période : <span className="font-medium">
                {dateRange.from ? new Date(`${dateRange.from}T${dateRange.fromTime}`).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "…"}
                {" → "}
                {dateRange.to ? new Date(`${dateRange.to}T${dateRange.toTime}`).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "…"}
              </span>
              <button onClick={() => setDateRange({ from: "", fromTime: "00:00", to: "", toTime: "23:59" })} aria-label="Retirer filtre période" className="hover:text-white"><X className="w-3 h-3" /></button>
            </span>
          )}
          {(Object.entries(textFilters) as [keyof typeof textFilters, string][])
            .filter(([, v]) => v !== "")
            .map(([key, value]) => {
              const labels: Record<keyof typeof textFilters, string> = { title: "Titre", assetName: "Asset", ipAddress: "IP", ioc: "IOC", affectedUser: "Utilisateur", description: "Description" };
              return (
                <span key={key} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/10 text-blue-400 text-xs rounded-full">
                  {labels[key]} : <span className="font-medium">{value}</span>
                  <button onClick={() => setTextFilters((prev) => ({ ...prev, [key]: "" }))} aria-label={`Retirer filtre ${labels[key]}`} className="hover:text-white"><X className="w-3 h-3" /></button>
                </span>
              );
            })}
          {totalActiveCount > 0 && (
            <button
              onClick={() => { clearAllFilters(); setGlobalSearch(""); }}
              className="text-xs text-gray-500 hover:text-white transition-colors ml-1"
            >
              Tout effacer
            </button>
          )}
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
                {displayedColumns.map((column) => (
                  <th key={column.key} scope="col" className={`px-4 py-3 text-center ${column.width}`}>
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-xs text-gray-400 uppercase tracking-wider">
                        {column.label}
                      </span>
                      {column.key === "occurredAt" && (
                        <button
                          onClick={() => setSortDirection((d) => d === "desc" ? "asc" : "desc")}
                          aria-label={`Trier ${sortDirection === "desc" ? "croissant" : "décroissant"}`}
                          className="p-1 rounded transition-colors hover:bg-[#1e2229] text-blue-400"
                          title={sortDirection === "desc" ? "Plus récent en premier" : "Plus ancien en premier"}
                        >
                          {sortDirection === "desc" ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />}
                        </button>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2229]">
              {loading && !data ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`sk-${i}`} role="status" aria-label="Chargement">
                    {displayedColumns.map((column) => (
                      <td key={column.key} className="px-4 py-4">
                        <Skeleton className="h-4 w-full bg-[#1e2229]" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan={displayedColumns.length} className="px-4 py-12 text-center text-gray-500">
                    {events.length === 0
                      ? "Aucun événement — ajoutez-en un."
                      : "Aucun événement correspondant aux filtres."}
                  </td>
                </tr>
              ) : (
                filteredEvents.map((event) => (
                  <tr key={event.id} className="hover:bg-[#1a1d24] transition-colors align-top">
                    {/* Timestamp — fixe, pas de retour à la ligne */}
                    {visibleColumns.has("occurredAt") && (
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-white text-center">
                        <CopyCell value={new Date(event.occurredAt).toLocaleString("fr-FR", {
                          day: "2-digit", month: "2-digit", year: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })} />
                      </td>
                    )}
                    {/* Événement — variable, wrap */}
                    {visibleColumns.has("title") && (
                      <td className="px-4 py-3 text-center">
                        <div className="group inline-flex items-start gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap justify-center items-center gap-1.5">
                              <span className="text-sm text-gray-200 font-medium break-words">{event.title}</span>
                              {event.isFirstDetection && (
                                <span className="shrink-0 px-1.5 py-0.5 text-xs rounded bg-red-500/10 text-red-400 whitespace-nowrap">
                                  Première détection
                                </span>
                              )}
                            </div>
                            {event.actor && (
                              <p className="text-xs text-blue-400 mt-0.5">
                                {event.actor.firstName} {event.actor.lastName}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(event.title); toast.success("Copié !"); }}
                            className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-white/10 rounded"
                            aria-label="Copier le titre"
                          >
                            <Copy className="w-3 h-3 text-gray-400" />
                          </button>
                        </div>
                      </td>
                    )}
                    {/* Type — fixe, badge */}
                    {visibleColumns.has("type") && (
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <div className="group inline-flex items-center gap-1">
                          <span className={`px-2 py-1 text-xs rounded ${EVENT_TYPE_COLORS[event.type]}`}>
                            {EVENT_TYPE_LABELS[event.type]}
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(EVENT_TYPE_LABELS[event.type]); toast.success("Copié !"); }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-white/10 rounded"
                            aria-label="Copier le type"
                          >
                            <Copy className="w-3 h-3 text-gray-400" />
                          </button>
                        </div>
                      </td>
                    )}
                    {/* Asset — variable, wrap */}
                    {visibleColumns.has("assetName") && (
                      <td className="px-4 py-3 text-sm text-gray-300 text-center">
                        {event.assetName
                          ? <CopyCell value={event.assetName} />
                          : <span className="text-gray-600">—</span>}
                      </td>
                    )}
                    {/* IP — fixe, mono */}
                    {visibleColumns.has("ipAddress") && (
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        {event.ipAddress
                          ? <span className="text-sm font-mono text-green-400"><CopyCell value={event.ipAddress} /></span>
                          : <span className="text-gray-600">—</span>}
                      </td>
                    )}
                    {/* IOC — liste structurée type+valeur */}
                    {visibleColumns.has("ioc") && (
                      <td className="px-4 py-3 text-center">
                        {(() => {
                          const iocs = parseIocs(event.ioc);
                          if (iocs.length === 0) return <span className="text-gray-600">—</span>;
                          return (
                            <div className="flex flex-col gap-1 items-center">
                              {iocs.map((ioc, i) => (
                                <div key={i} className="flex items-center gap-1.5">
                                  <span className="shrink-0 text-xs text-gray-500 bg-[#1a1d24] px-1.5 py-0.5 rounded">
                                    {IOC_TYPE_LABELS[ioc.iocType]}
                                  </span>
                                  <CopyCell value={ioc.value} className="font-mono text-xs text-yellow-400" />
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </td>
                    )}
                    {/* Utilisateur — variable, wrap */}
                    {visibleColumns.has("affectedUser") && (
                      <td className="px-4 py-3 text-sm text-gray-300 text-center">
                        {event.affectedUser
                          ? <CopyCell value={event.affectedUser} />
                          : <span className="text-gray-600">—</span>}
                      </td>
                    )}
                    {/* Description — variable, wrap */}
                    {visibleColumns.has("description") && (
                      <td className="px-4 py-3 text-sm text-gray-400 text-center">
                        {event.description
                          ? <CopyCell value={event.description} />
                          : <span className="text-gray-600">—</span>}
                      </td>
                    )}
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
