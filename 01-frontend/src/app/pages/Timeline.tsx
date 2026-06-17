import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { timelineEventSchema } from "../../lib/formSchemas";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { FormModal } from "../components/FormModal";
import { Checkbox } from "../components/ui/checkbox";
import {
  Filter, SlidersHorizontal, X, Plus, Loader2, Trash2, Download, Pencil,
  ArrowUp, ArrowDown, Search, Copy, Link, Unlink, Shield, ShieldAlert, Tag,
} from "lucide-react";
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
  CREATE_OPENCTI_OBSERVABLE_MUTATION,
  IOCS_BY_EVENT_QUERY,
  ADD_IOC_MUTATION,
  REMOVE_IOC_MUTATION,
} from "../../graphql/timeline";
import { EXPORT_INCIDENT_TO_OPENCTI_MUTATION } from "../../graphql/incident";
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

function toDatetimeLocal(iso: string | Date): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Formulaire ────────────────────────────────────────────────────────────────
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
    setValue,
    control,
    formState: { errors },
  } = useForm<NewEventForm>({
    resolver: zodResolver(timelineEventSchema),
    defaultValues: initial ?? EMPTY_FORM,
  });

  const isDetection = watch("type") === "DETECTION";
  const titleValue = watch("title");
  const iocValue = watch("ioc");

  // Recherche OpenCTI sur le titre
  const [searchByTitle, { data: titleData, loading: titleSearching }] = useLazyQuery<{ searchOpenCTI: OpenCTIEntity[] }>(SEARCH_OPENCTI_QUERY);
  const [showTitleSuggestions, setShowTitleSuggestions] = useState(false);

  // Recherche OpenCTI sur l'IoC
  const [searchByIoc, { data: iocData, loading: iocSearching }] = useLazyQuery<{ searchOpenCTI: OpenCTIEntity[] }>(SEARCH_OPENCTI_QUERY);
  const [showIocSuggestions, setShowIocSuggestions] = useState(false);

  useEffect(() => {
    if (!titleValue || titleValue.trim().length < 3) { setShowTitleSuggestions(false); return; }
    const timer = setTimeout(() => {
      searchByTitle({ variables: { query: titleValue.trim() } });
      setShowTitleSuggestions(true);
    }, 500);
    return () => clearTimeout(timer);
  }, [titleValue]);

  useEffect(() => {
    if (!iocValue || iocValue.trim().length < 2) { setShowIocSuggestions(false); return; }
    const timer = setTimeout(() => {
      searchByIoc({ variables: { query: iocValue.trim() } });
      setShowIocSuggestions(true);
    }, 500);
    return () => clearTimeout(timer);
  }, [iocValue]);

  const titleSuggestions = titleData?.searchOpenCTI ?? [];
  const iocSuggestions = iocData?.searchOpenCTI ?? [];

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

          <div className="relative">
            <label className="block text-sm text-gray-400 mb-1.5">Titre *</label>
            <div className="flex items-center gap-2">
              <input
                {...register("title")}
                className={inputCls}
                placeholder="Ex : Détection d'un accès non autorisé"
                onFocus={() => titleValue && titleValue.length >= 3 && setShowTitleSuggestions(true)}
                onBlur={() => setTimeout(() => setShowTitleSuggestions(false), 200)}
                autoComplete="off"
              />
              {titleSearching && <Loader2 className="w-4 h-4 animate-spin text-orange-400 shrink-0" />}
            </div>
            {errors.title && <p className={errCls}>{errors.title.message}</p>}
            {showTitleSuggestions && titleSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1d24] border border-orange-500/30 rounded-lg shadow-xl z-20 max-h-40 overflow-y-auto">
                <p className="px-3 py-1.5 text-xs text-orange-400 border-b border-[#1e2229]">Entités OpenCTI correspondantes</p>
                {titleSuggestions.map((s) => (
                  <button key={s.id} type="button"
                    onMouseDown={() => { setValue("title", s.name); setShowTitleSuggestions(false); toast.success("Entité CTI liée : " + s.name); }}
                    className="w-full text-left px-3 py-2 hover:bg-[#2a2e39] transition-colors flex items-center justify-between gap-2">
                    <span className="text-sm text-white truncate">{s.name}</span>
                    <span className="text-xs text-orange-400 shrink-0">{s.entity_type}</span>
                  </button>
                ))}
              </div>
            )}
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

          <div className="relative">
            <label className="block text-sm text-gray-400 mb-1.5">IOC</label>
            <div className="flex items-center gap-2">
              <input
                {...register("ioc")}
                className={inputCls}
                placeholder="Hash, domaine, IP…"
                onFocus={() => iocValue && iocValue.length >= 2 && setShowIocSuggestions(true)}
                onBlur={() => setTimeout(() => setShowIocSuggestions(false), 200)}
                autoComplete="off"
              />
              {iocSearching && <Loader2 className="w-4 h-4 animate-spin text-orange-400 shrink-0" />}
            </div>
            {errors.ioc && <p className={errCls}>{errors.ioc.message}</p>}
            {showIocSuggestions && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1d24] border border-orange-500/30 rounded-lg shadow-xl z-20 max-h-40 overflow-y-auto">
                {iocSuggestions.length > 0 ? (
                  <>
                    <p className="px-3 py-1.5 text-xs text-orange-400 border-b border-[#1e2229]">Trouvé dans OpenCTI</p>
                    {iocSuggestions.map((s) => (
                      <button key={s.id} type="button"
                        onMouseDown={() => { setValue("ioc", s.name); setShowIocSuggestions(false); toast.success("IoC lié : " + s.name); }}
                        className="w-full text-left px-3 py-2 hover:bg-[#2a2e39] transition-colors flex items-center justify-between gap-2">
                        <span className="text-sm text-white font-mono truncate">{s.name}</span>
                        <span className="text-xs text-orange-400 shrink-0">{s.entity_type}</span>
                      </button>
                    ))}
                  </>
                ) : iocData && !iocSearching ? (
                  <div className="px-3 py-2 text-xs text-gray-500 flex items-center gap-2">
                    <span>Non trouvé dans OpenCTI —</span>
                    <span className="text-green-400">sera créé à la sauvegarde</span>
                  </div>
                ) : null}
              </div>
            )}
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

// ── CopyCell ──────────────────────────────────────────────────────────────────
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

// ── IoC ───────────────────────────────────────────────────────────────────────
const IOC_TYPES = ["IPV4","IPV6","HASH_MD5","HASH_SHA1","HASH_SHA256","DOMAIN","URL","EMAIL","YARA","OTHER"] as const;
type IoCType = typeof IOC_TYPES[number];

const IOC_COLORS: Record<IoCType, string> = {
  IPV4: "bg-red-500/10 text-red-400", IPV6: "bg-red-500/10 text-red-400",
  HASH_MD5: "bg-purple-500/10 text-purple-400", HASH_SHA1: "bg-purple-500/10 text-purple-400",
  HASH_SHA256: "bg-purple-500/10 text-purple-400", DOMAIN: "bg-orange-500/10 text-orange-400",
  URL: "bg-yellow-500/10 text-yellow-400", EMAIL: "bg-blue-500/10 text-blue-400",
  YARA: "bg-green-500/10 text-green-400", OTHER: "bg-gray-500/10 text-gray-400",
};

const IOC_LABELS: Record<IoCType, string> = {
  IPV4: "IPv4", IPV6: "IPv6", HASH_MD5: "MD5", HASH_SHA1: "SHA1",
  HASH_SHA256: "SHA256", DOMAIN: "Domain", URL: "URL", EMAIL: "Email", YARA: "Yara", OTHER: "Other",
};

interface GqlIoC { id: string; type: IoCType; value: string; description?: string | null; createdAt: string; }

interface OpenCTIEntity { id: string; name: string; entity_type: string; description?: string | null; }

// ── Modal IoC ─────────────────────────────────────────────────────────────────
interface IoCModalProps { event: GqlTimelineEvent; onClose: () => void; }

function IoCModal({ event, onClose }: IoCModalProps) {
  const [type, setType] = useState<IoCType>("IPV4");
  const [value, setValue] = useState(event.ipAddress ?? "");
  const [description, setDescription] = useState("");
  const [adding, setAdding] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const { data, refetch } = useQuery<{ iocsByEvent: GqlIoC[] }>(IOCS_BY_EVENT_QUERY, {
    variables: { timelineEventId: event.id },
  });
  const [addIoC] = useMutation(ADD_IOC_MUTATION);
  const [removeIoC] = useMutation(REMOVE_IOC_MUTATION);
  const [linkToOpenCTI] = useMutation(LINK_OPENCTI_MUTATION, {
    refetchQueries: [{ query: TIMELINE_EVENTS_QUERY }],
  });
  const [createObservable] = useMutation(CREATE_OPENCTI_OBSERVABLE_MUTATION);
  const [searchOpenCTI, { data: octiData, loading: octiSearching }] = useLazyQuery<{
    searchOpenCTI: OpenCTIEntity[];
  }>(SEARCH_OPENCTI_QUERY);

  useEffect(() => {
    if (value.trim().length < 2) { setShowSuggestions(false); return; }
    const timer = setTimeout(() => {
      searchOpenCTI({ variables: { query: value.trim() } });
      setShowSuggestions(true);
    }, 500);
    return () => clearTimeout(timer);
  }, [value]);

  const iocs = data?.iocsByEvent ?? [];
  const suggestions = octiData?.searchOpenCTI ?? [];

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setAdding(true);
    try {
      await addIoC({ variables: { timelineEventId: event.id, type, value: value.trim(), description: description || null } });
      setValue(""); setDescription(""); setShowSuggestions(false); refetch();
    } finally { setAdding(false); }
  }

  async function handleRemove(id: string) {
    await removeIoC({ variables: { id } }); refetch();
  }

  async function handleLinkSuggestion(entity: OpenCTIEntity) {
    setAdding(true);
    try {
      await addIoC({ variables: { timelineEventId: event.id, type, value: entity.name, description: entity.description || entity.entity_type } });
      await linkToOpenCTI({ variables: { eventId: event.id, openctiEntityId: entity.id, openctiEntityType: entity.entity_type } });
      setValue(""); setDescription(""); setShowSuggestions(false); refetch();
      toast.success("IoC ajouté et lié à OpenCTI");
    } finally { setAdding(false); }
  }

  async function handleCreateInOpenCTI() {
    if (!value.trim()) return;
    setAdding(true);
    try {
      const isIP = /^\d{1,3}(\.\d{1,3}){3}$/.test(value.trim());
      const octiType = isIP ? "IPv4-Addr" : "Hostname";
      const res = await createObservable({ variables: { type: octiType, value: value.trim(), description: description || event.title } });
      const entity = res.data?.createOpenCTIObservable;
      if (entity) {
        await addIoC({ variables: { timelineEventId: event.id, type, value: value.trim(), description: description || null } });
        await linkToOpenCTI({ variables: { eventId: event.id, openctiEntityId: entity.id, openctiEntityType: entity.entity_type } });
        toast.success("IoC créé dans OpenCTI et lié");
      }
      setValue(""); setDescription(""); setShowSuggestions(false); refetch();
    } finally { setAdding(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-[#13151a] border border-[#1e2229] rounded-lg w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e2229]">
          <div>
            <h2 className="text-white font-medium flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-400" /> Indicateurs de Compromission (IoC)
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">{event.title}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleAdd} className="px-6 pt-4 pb-3 border-b border-[#1e2229]">
          <div className="flex gap-2 mb-2">
            <select value={type} onChange={(e) => setType(e.target.value as IoCType)}
              className="bg-[#0a0b0d] border border-[#1e2229] rounded-md px-2 py-2 text-white text-sm focus:outline-none focus:border-red-500 transition-colors">
              {IOC_TYPES.map((t) => <option key={t} value={t}>{IOC_LABELS[t]}</option>)}
            </select>
            <div className="flex-1 relative">
              <input type="text" value={value} onChange={(e) => setValue(e.target.value)}
                placeholder="Valeur de l'IoC..."
                className="w-full bg-[#0a0b0d] border border-[#1e2229] rounded-md px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-red-500 transition-colors" />
              {showSuggestions && value.trim().length >= 2 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1d24] border border-[#1e2229] rounded-lg shadow-xl z-10 max-h-48 overflow-y-auto">
                  {octiSearching && <div className="flex items-center gap-2 px-3 py-2 text-gray-500 text-sm"><Loader2 className="w-3 h-3 animate-spin" /> Recherche dans OpenCTI...</div>}
                  {!octiSearching && suggestions.length > 0 && (
                    <>
                      <p className="px-3 py-1.5 text-xs text-gray-500 border-b border-[#1e2229]">Trouvé dans OpenCTI — cliquer pour lier</p>
                      {suggestions.map((s) => (
                        <button key={s.id} type="button" onClick={() => handleLinkSuggestion(s)}
                          className="w-full text-left px-3 py-2 hover:bg-[#2a2e39] transition-colors flex items-center justify-between gap-2">
                          <span className="text-sm text-white truncate">{s.name}</span>
                          <span className="text-xs text-orange-400 flex-shrink-0">{s.entity_type}</span>
                        </button>
                      ))}
                    </>
                  )}
                  {!octiSearching && suggestions.length === 0 && octiData && (
                    <button type="button" onClick={handleCreateInOpenCTI}
                      className="w-full text-left px-3 py-2 hover:bg-green-500/10 transition-colors flex items-center gap-2 text-green-400 text-sm">
                      <Plus className="w-3 h-3" /> Créer "{value.trim()}" dans OpenCTI et lier
                    </button>
                  )}
                </div>
              )}
            </div>
            <button type="submit" disabled={adding || !value.trim()}
              className="flex items-center gap-1 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm transition-colors disabled:opacity-50">
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </button>
          </div>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optionnel)..."
            className="w-full bg-[#0a0b0d] border border-[#1e2229] rounded-md px-3 py-1.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-red-500 transition-colors" />
        </form>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {iocs.length === 0 ? (
            <p className="text-center text-gray-600 py-6 text-sm">Aucun IoC associé à cet événement</p>
          ) : (
            <div className="space-y-2">
              {iocs.map((ioc) => (
                <div key={ioc.id} className="flex items-start justify-between gap-2 p-3 bg-[#0a0b0d] border border-[#1e2229] rounded-lg">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${IOC_COLORS[ioc.type]}`}>{IOC_LABELS[ioc.type]}</span>
                      <span className="text-sm text-white font-mono truncate">{ioc.value}</span>
                    </div>
                    {ioc.description && <p className="text-xs text-gray-500">{ioc.description}</p>}
                  </div>
                  <button onClick={() => handleRemove(ioc.id)}
                    className="p-1 hover:bg-red-500/10 rounded text-gray-500 hover:text-red-400 transition-colors flex-shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Modal OpenCTI ─────────────────────────────────────────────────────────────
interface OpenCTIModalProps {
  event: GqlTimelineEvent;
  onClose: () => void;
  onLink: (entity: OpenCTIEntity) => Promise<void>;
  onUnlink: () => Promise<void>;
}

function OpenCTIModal({ event, onClose, onLink, onUnlink }: OpenCTIModalProps) {
  const initialQuery = event.ipAddress ?? event.assetName ?? "";
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [linking, setLinking] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createObservable] = useMutation(CREATE_OPENCTI_OBSERVABLE_MUTATION);
  const [searchOpenCTI, { data: searchData, loading: searching }] = useLazyQuery<{
    searchOpenCTI: OpenCTIEntity[];
  }>(SEARCH_OPENCTI_QUERY);

  useEffect(() => {
    if (initialQuery.trim().length >= 2) {
      searchOpenCTI({ variables: { query: initialQuery.trim() } });
    }
  }, []);

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

  async function handleCreate() {
    if (!searchQuery.trim()) return;
    setCreating(true);
    try {
      const isIP = /^\d{1,3}(\.\d{1,3}){3}$/.test(searchQuery.trim());
      const type = isIP ? "IPv4-Addr" : "Hostname";
      const res = await createObservable({ variables: { type, value: searchQuery.trim(), description: event.description ?? event.title } });
      const entity = res.data?.createOpenCTIObservable;
      if (entity) { await onLink(entity); onClose(); }
    } finally { setCreating(false); }
  }

  const results = searchData?.searchOpenCTI ?? [];
  const hasSearched = !!searchData;

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
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
        </div>

        {event.openctiEntityId && (
          <div className="mx-6 mt-4 p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-orange-400 uppercase tracking-wider mb-0.5">Entité liée</p>
                <p className="text-sm text-white">{event.openctiEntityType}</p>
                <p className="text-xs text-gray-400 font-mono truncate">{event.openctiEntityId}</p>
              </div>
              <button onClick={handleUnlink} disabled={linking}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded text-xs transition-colors disabled:opacity-50">
                <Unlink className="w-3 h-3" /> Délier
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSearch} className="px-6 pt-4 pb-2">
          <div className="flex gap-2">
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="IP, domaine, hash, malware…"
              className="flex-1 bg-[#0a0b0d] border border-[#1e2229] rounded-md px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-orange-500 transition-colors" />
            <button type="submit" disabled={searching || searchQuery.trim().length < 2}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-md text-sm transition-colors disabled:opacity-50">
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Chercher
            </button>
          </div>
        </form>

        <div className="flex-1 overflow-y-auto px-6 pb-4">
          {searching && <div className="flex items-center justify-center py-8 text-gray-500"><Loader2 className="w-5 h-5 animate-spin mr-2" />Recherche dans OpenCTI…</div>}
          {!searching && hasSearched && results.length === 0 && (
            <div className="text-center py-6">
              <p className="text-gray-500 text-sm mb-4">Aucune entité trouvée pour "{searchQuery}"</p>
              <button onClick={handleCreate} disabled={creating || !searchQuery.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm transition-colors disabled:opacity-50 mx-auto">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {creating ? "Création…" : "Créer dans OpenCTI"}
              </button>
            </div>
          )}
          {!searching && results.length > 0 && (
            <div className="space-y-2 mt-2">
              {results.map((entity) => (
                <button key={entity.id} onClick={() => handleLink(entity)} disabled={linking}
                  className="w-full text-left p-3 bg-[#0a0b0d] hover:bg-[#1e2229] border border-[#1e2229] hover:border-orange-500/40 rounded-lg transition-colors disabled:opacity-50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm text-white font-medium truncate">{entity.name}</p>
                      <p className="text-xs text-orange-400 mt-0.5">{entity.entity_type}</p>
                      {entity.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{entity.description}</p>}
                    </div>
                    <Link className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                  </div>
                </button>
              ))}
            </div>
          )}
          {!hasSearched && !searching && (
            <p className="text-center text-gray-600 py-8 text-sm">
              {initialQuery.length >= 2 ? "Recherche automatique en cours…" : "Lancez une recherche pour trouver des entités OpenCTI"}
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
  const [exportingOCTI, setExportingOCTI] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [globalSearch, setGlobalSearch] = useState("");
  const [openctiEvent, setOpenctiEvent] = useState<GqlTimelineEvent | null>(null);
  const [iocEvent, setIocEvent] = useState<GqlTimelineEvent | null>(null);

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

  // ── OpenCTI ───────────────────────────────────────────────────────────────
  const { data: statusData } = useQuery<{ openctiStatus: boolean }>(OPENCTI_STATUS_QUERY);
  const openctiEnabled = statusData?.openctiStatus ?? false;
  const [exportToOpenCTI] = useMutation(EXPORT_INCIDENT_TO_OPENCTI_MUTATION);
  const [linkToOpenCTI] = useMutation(LINK_OPENCTI_MUTATION, {
    refetchQueries: [{ query: TIMELINE_EVENTS_QUERY, variables: { incidentId } }],
  });
  const [unlinkFromOpenCTI] = useMutation(UNLINK_OPENCTI_MUTATION, {
    refetchQueries: [{ query: TIMELINE_EVENTS_QUERY, variables: { incidentId } }],
  });

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
            return { timelineEvents: prev.timelineEvents.filter((e: GqlTimelineEvent) => e.id !== variables.id) };
          }
        );
      },
    }
  );

  const [updateTimelineEvent] = useMutation<{ updateTimelineEvent: GqlTimelineEvent }>(UPDATE_TIMELINE_EVENT_MUTATION);

  function eventToForm(event: GqlTimelineEvent): NewEventForm {
    return {
      type: event.type,
      title: event.title,
      description: event.description ?? "",
      occurredAt: toDatetimeLocal(event.occurredAt),
      isFirstDetection: event.isFirstDetection ?? false,
      ipAddress: event.ipAddress ?? "",
      assetName: event.assetName ?? "",
      affectedUser: event.affectedUser ?? "",
      ioc: event.ioc ?? "",
    };
  }

  async function handleCreateEvent(form: NewEventForm) {
    setModalError(null); setModalSubmitting(true);
    try {
      await createTimelineEvent({
        variables: {
          incidentId,
          input: {
            type: form.type, title: form.title, description: form.description || null,
            occurredAt: new Date(form.occurredAt).toISOString(),
            isFirstDetection: form.type === "DETECTION" ? form.isFirstDetection : false,
            ipAddress: form.ipAddress || null, assetName: form.assetName || null,
            affectedUser: form.affectedUser || null, ioc: form.ioc || null,
          },
        },
        ...(form.type === "DETECTION" && form.isFirstDetection
          ? { refetchQueries: [{ query: TIMELINE_EVENTS_QUERY, variables: { incidentId } }] } : {}),
      });
      toast.success("Événement ajouté");
      setShowModal(false);
    } catch (err: unknown) {
      const msg = (err as { graphQLErrors?: Array<{ message: string }> })?.graphQLErrors?.[0]?.message ?? "Erreur lors de la création";
      setModalError(msg);
    } finally { setModalSubmitting(false); }
  }

  async function handleUpdateEvent(form: NewEventForm) {
    if (!editing) return;
    setModalError(null); setModalSubmitting(true);
    try {
      await updateTimelineEvent({
        variables: {
          id: editing.id,
          input: {
            type: form.type, title: form.title, description: form.description || null,
            occurredAt: new Date(form.occurredAt).toISOString(),
            isFirstDetection: form.type === "DETECTION" ? form.isFirstDetection : false,
            ipAddress: form.ipAddress || null, assetName: form.assetName || null,
            affectedUser: form.affectedUser || null, ioc: form.ioc || null,
          },
        },
        ...(form.type === "DETECTION" && form.isFirstDetection
          ? { refetchQueries: [{ query: TIMELINE_EVENTS_QUERY, variables: { incidentId } }] } : {}),
      });
      toast.success("Événement modifié");
      setEditing(null);
    } catch (err: unknown) {
      const msg = (err as { graphQLErrors?: Array<{ message: string }> })?.graphQLErrors?.[0]?.message ?? "Erreur lors de la modification";
      setModalError(msg);
    } finally { setModalSubmitting(false); }
  }

  function toggleTypeFilter(t: GqlTimelineEventType) {
    setTypeFilters((prev) => { const next = new Set(prev); if (next.has(t)) next.delete(t); else next.add(t); return next; });
  }

  function clearAllFilters() {
    setTypeFilters(new Set());
    setDateRange({ from: "", fromTime: "00:00", to: "", toTime: "23:59" });
    setTextFilters({ title: "", assetName: "", ipAddress: "", ioc: "", affectedUser: "", description: "" });
  }

  const events = [...(data?.timelineEvents ?? [])].sort((a, b) => {
    const diff = new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime();
    return sortDirection === "desc" ? -diff : diff;
  });

  const filteredEvents = events.filter((event) => {
    if (globalSearch) {
      const needle = globalSearch.toLowerCase();
      const haystack = [event.title, event.description ?? "", event.assetName ?? "", event.ipAddress ?? "", event.affectedUser ?? "", event.ioc ?? "", EVENT_TYPE_LABELS[event.type]].join(" ").toLowerCase();
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
    if (tf.ioc && !(event.ioc ?? "").toLowerCase().includes(tf.ioc.toLowerCase())) return false;
    if (tf.affectedUser && !(event.affectedUser ?? "").toLowerCase().includes(tf.affectedUser.toLowerCase())) return false;
    if (tf.description && !(event.description ?? "").toLowerCase().includes(tf.description.toLowerCase())) return false;
    return true;
  });

  const isDateRangeActive = dateRange.from !== "" || dateRange.to !== "";
  const activeFilterCount =
    (typeFilters.size > 0 ? 1 : 0) + (isDateRangeActive ? 1 : 0) +
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
    ...(canWrite ? [{ key: "_actions", label: "", width: "w-24", fixed: true }] : []),
  ];
  const displayedColumns = columns.filter((c) => visibleColumns.has(c.key));
  const filterInputCls = "w-full px-3 py-1.5 bg-[#0f1116] border border-[#1e2229] rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors";

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
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {exporting ? "Export…" : "Exporter Excel"}
          </button>
          {openctiEnabled && canWrite && (
            <button
              onClick={async () => {
                if (exportingOCTI) return;
                setExportingOCTI(true);
                try {
                  const res = await exportToOpenCTI({ variables: { incidentId } });
                  const name = res.data?.exportIncidentToOpenCTI?.name ?? "Case";
                  toast.success("Exporté vers OpenCTI : " + name, { description: "Case STIX créé avec succès" });
                } catch (e) {
                  toast.error("Erreur export OpenCTI", { description: e instanceof Error ? e.message : "Erreur inconnue" });
                } finally { setExportingOCTI(false); }
              }}
              disabled={exportingOCTI}
              className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {exportingOCTI ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
              {exportingOCTI ? "Export…" : "Exporter vers OpenCTI"}
            </button>
          )}
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
          <input type="text" value={globalSearch} onChange={(e) => setGlobalSearch(e.target.value)}
            placeholder="Rechercher dans tous les champs…"
            className="w-full pl-9 pr-9 py-2 bg-[#13151a] border border-[#1e2229] rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors" />
          {globalSearch && (
            <button onClick={() => setGlobalSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <button onClick={() => setFilterPanelOpen((o) => !o)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors shrink-0 ${filterPanelOpen || activeFilterCount > 0 ? "bg-blue-600/20 border-blue-500/50 text-blue-400" : "bg-[#13151a] border-[#1e2229] text-gray-400 hover:text-white hover:border-[#2a2e39]"}`}>
          <Filter className="w-4 h-4" />
          Filtres
          {activeFilterCount > 0 && <span className="ml-0.5 px-1.5 py-0.5 text-xs rounded-full bg-blue-500 text-white leading-none">{activeFilterCount}</span>}
        </button>
        <div className="relative shrink-0" ref={columnPickerRef}>
          <button onClick={() => setColumnPickerOpen((o) => !o)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${columnPickerOpen ? "bg-blue-600/20 border-blue-500/50 text-blue-400" : "bg-[#13151a] border-[#1e2229] text-gray-400 hover:text-white hover:border-[#2a2e39]"}`}>
            <SlidersHorizontal className="w-4 h-4" />
            Colonnes
          </button>
          {columnPickerOpen && (
            <div className="absolute right-0 top-full mt-1 z-20 bg-[#13151a] border border-[#1e2229] rounded-lg p-3 shadow-xl min-w-44">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2 font-medium">Colonnes affichées</p>
              {columns.filter((c) => c.key !== "_actions").map((col) => (
                <label key={col.key} className="flex items-center gap-2.5 py-1.5 cursor-pointer group">
                  <input type="checkbox" checked={visibleColumns.has(col.key)}
                    onChange={() => { setVisibleColumns((prev) => { const next = new Set(prev); if (next.has(col.key)) next.delete(col.key); else next.add(col.key); return next; }); }}
                    className="accent-blue-500 w-3.5 h-3.5 shrink-0" />
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
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Type</p>
            <div className="flex flex-wrap gap-2">
              {EVENT_TYPES.map((t) => (
                <button key={t} onClick={() => toggleTypeFilter(t)}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors ${typeFilters.has(t) ? `${EVENT_TYPE_COLORS[t]} border-current` : "border-[#1e2229] text-gray-500 hover:border-[#2a2e39] hover:text-gray-300"}`}>
                  {EVENT_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Période</p>
            <div className="grid grid-cols-4 gap-3">
              <div><label className="block text-xs text-gray-500 mb-1">Date de début</label>
                <input type="date" value={dateRange.from} onChange={(e) => setDateRange((r) => ({ ...r, from: e.target.value }))} className={filterInputCls} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Heure de début</label>
                <input type="time" value={dateRange.fromTime} onChange={(e) => setDateRange((r) => ({ ...r, fromTime: e.target.value }))} disabled={!dateRange.from} className={`${filterInputCls} disabled:opacity-30 disabled:cursor-not-allowed`} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Date de fin</label>
                <input type="date" value={dateRange.to} onChange={(e) => setDateRange((r) => ({ ...r, to: e.target.value }))} className={filterInputCls} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Heure de fin</label>
                <input type="time" value={dateRange.toTime} onChange={(e) => setDateRange((r) => ({ ...r, toTime: e.target.value }))} disabled={!dateRange.to} className={`${filterInputCls} disabled:opacity-30 disabled:cursor-not-allowed`} /></div>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Champs</p>
            <div className="grid grid-cols-3 gap-3">
              {([["title", "Titre / Événement"], ["assetName", "Asset"], ["ipAddress", "IP"], ["ioc", "IOC"], ["affectedUser", "Utilisateur"], ["description", "Description"]] as [keyof typeof textFilters, string][]).map(([key, label]) => (
                <div key={key}><label className="block text-xs text-gray-500 mb-1">{label}</label>
                  <input type="text" value={textFilters[key]} onChange={(e) => setTextFilters((prev) => ({ ...prev, [key]: e.target.value }))} placeholder="Filtrer…" className={filterInputCls} /></div>
              ))}
            </div>
          </div>
          {activeFilterCount > 0 && (
            <div className="flex justify-end pt-1 border-t border-[#1e2229]">
              <button onClick={clearAllFilters} className="text-sm text-gray-400 hover:text-white transition-colors">Réinitialiser les filtres</button>
            </div>
          )}
        </div>
      )}

      {/* Résumé filtres actifs */}
      {totalActiveCount > 0 && (
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500">Filtres actifs :</span>
          {globalSearch && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/10 text-blue-400 text-xs rounded-full">
              Recherche : <span className="font-medium">{globalSearch}</span>
              <button onClick={() => setGlobalSearch("")} className="hover:text-white"><X className="w-3 h-3" /></button>
            </span>
          )}
          {typeFilters.size > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/10 text-blue-400 text-xs rounded-full">
              Types : <span className="font-medium">{[...typeFilters].map((t) => EVENT_TYPE_LABELS[t]).join(", ")}</span>
              <button onClick={() => setTypeFilters(new Set())} className="hover:text-white"><X className="w-3 h-3" /></button>
            </span>
          )}
          {totalActiveCount > 0 && (
            <button onClick={() => { clearAllFilters(); setGlobalSearch(""); }} className="text-xs text-gray-500 hover:text-white transition-colors ml-1">Tout effacer</button>
          )}
        </div>
      )}

      {queryError && <div className="bg-red-400/10 border border-red-400/20 rounded-lg p-4 text-red-400 text-sm mb-4">{queryError.message}</div>}

      {/* Tableau */}
      <div className="bg-[#13151a] border border-[#1e2229] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#0a0b0d] border-b border-[#1e2229]">
              <tr>
                {displayedColumns.map((column) => (
                  <th key={column.key} scope="col" className={`px-4 py-3 text-center ${column.width}`}>
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-xs text-gray-400 uppercase tracking-wider">{column.label}</span>
                      {column.key === "occurredAt" && (
                        <button onClick={() => setSortDirection((d) => d === "desc" ? "asc" : "desc")}
                          className="p-1 rounded transition-colors hover:bg-[#1e2229] text-blue-400">
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
                  <tr key={`sk-${i}`}>
                    {displayedColumns.map((column) => (
                      <td key={column.key} className="px-4 py-4"><Skeleton className="h-4 w-full bg-[#1e2229]" /></td>
                    ))}
                  </tr>
                ))
              ) : filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan={displayedColumns.length} className="px-4 py-12 text-center text-gray-500">
                    {events.length === 0 ? "Aucun événement — ajoutez-en un." : "Aucun événement correspondant aux filtres."}
                  </td>
                </tr>
              ) : (
                filteredEvents.map((event) => (
                  <tr key={event.id} className="hover:bg-[#1a1d24] transition-colors align-top">
                    {visibleColumns.has("occurredAt") && (
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-white text-center">
                        <CopyCell value={new Date(event.occurredAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })} />
                      </td>
                    )}
                    {visibleColumns.has("title") && (
                      <td className="px-4 py-3 text-center">
                        <div className="group inline-flex items-start gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap justify-center items-center gap-1.5">
                              <span className="text-sm text-gray-200 font-medium break-words">{event.title}</span>
                              {event.isFirstDetection && (
                                <span className="shrink-0 px-1.5 py-0.5 text-xs rounded bg-red-500/10 text-red-400 whitespace-nowrap">Première détection</span>
                              )}
                            </div>
                            {event.actor && <p className="text-xs text-blue-400 mt-0.5">{event.actor.firstName} {event.actor.lastName}</p>}
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(event.title); toast.success("Copié !"); }}
                            className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-white/10 rounded">
                            <Copy className="w-3 h-3 text-gray-400" />
                          </button>
                        </div>
                      </td>
                    )}
                    {visibleColumns.has("type") && (
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <div className="group inline-flex items-center gap-1">
                          <span className={`px-2 py-1 text-xs rounded ${EVENT_TYPE_COLORS[event.type]}`}>{EVENT_TYPE_LABELS[event.type]}</span>
                          <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(EVENT_TYPE_LABELS[event.type]); toast.success("Copié !"); }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-white/10 rounded">
                            <Copy className="w-3 h-3 text-gray-400" />
                          </button>
                        </div>
                      </td>
                    )}
                    {visibleColumns.has("assetName") && (
                      <td className="px-4 py-3 text-sm text-gray-300 text-center">
                        {event.assetName ? <CopyCell value={event.assetName} /> : <span className="text-gray-600">—</span>}
                      </td>
                    )}
                    {visibleColumns.has("ipAddress") && (
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        {event.ipAddress ? <span className="text-sm font-mono text-green-400"><CopyCell value={event.ipAddress} /></span> : <span className="text-gray-600">—</span>}
                      </td>
                    )}
                    {visibleColumns.has("ioc") && (
                      <td className="px-4 py-3 text-center">
                        {event.ioc ? <span className="text-sm font-mono text-yellow-400"><CopyCell value={event.ioc} /></span> : <span className="text-gray-600">—</span>}
                      </td>
                    )}
                    {visibleColumns.has("affectedUser") && (
                      <td className="px-4 py-3 text-sm text-gray-300 text-center">
                        {event.affectedUser ? <CopyCell value={event.affectedUser} /> : <span className="text-gray-600">—</span>}
                      </td>
                    )}
                    {visibleColumns.has("description") && (
                      <td className="px-4 py-3 text-sm text-gray-400 text-center">
                        {event.description ? <CopyCell value={event.description} /> : <span className="text-gray-600">—</span>}
                      </td>
                    )}
                    {canWrite && (
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1 justify-center">
                          <button onClick={() => { setEditing(event); setModalError(null); }}
                            className="p-1 hover:bg-blue-500/10 rounded transition-colors text-gray-500 hover:text-blue-400" title="Modifier">
                            <Pencil className="w-4 h-4" />
                          </button>
                          {openctiEnabled && (
                            <button onClick={() => setOpenctiEvent(event)}
                              className={`p-1 rounded transition-colors ${event.openctiEntityId ? "text-orange-400 hover:bg-orange-500/10" : "text-gray-500 hover:bg-[#1e2229] hover:text-orange-400"}`}
                              title={event.openctiEntityId ? `Lié : ${event.openctiEntityType}` : "Lier à OpenCTI"}>
                              <Link className="w-4 h-4" />
                            </button>
                          )}
                          <button onClick={() => setIocEvent(event)}
                            className="p-1 rounded transition-colors text-gray-500 hover:bg-red-500/10 hover:text-red-400" title="Gérer les IoC">
                            <Tag className="w-4 h-4" />
                          </button>
                          <button onClick={() => setConfirmDeleteId(event.id)}
                            className="p-1 hover:bg-red-500/10 rounded transition-colors text-gray-500 hover:text-red-400" title="Supprimer">
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

      {/* Modals */}
      {showModal && (
        <EventModal mode="create" onClose={() => setShowModal(false)} onSubmit={handleCreateEvent} submitting={modalSubmitting} error={modalError} />
      )}
      {editing && (
        <EventModal mode="edit" initial={eventToForm(editing)} onClose={() => setEditing(null)} onSubmit={handleUpdateEvent} submitting={modalSubmitting} error={modalError} />
      )}
      {iocEvent && <IoCModal event={iocEvent} onClose={() => setIocEvent(null)} />}
      {openctiEvent && (
        <OpenCTIModal
          event={openctiEvent}
          onClose={() => setOpenctiEvent(null)}
          onLink={async (entity: OpenCTIEntity) => {
            await linkToOpenCTI({ variables: { eventId: openctiEvent.id, openctiEntityId: entity.id, openctiEntityType: entity.entity_type } });
          }}
          onUnlink={async () => {
            await unlinkFromOpenCTI({ variables: { eventId: openctiEvent.id } });
          }}
        />
      )}
      <ConfirmDialog
        open={!!confirmDeleteId}
        description="Supprimer cet événement de la timeline ?"
        onConfirm={() => { if (confirmDeleteId) deleteTimelineEvent({ variables: { id: confirmDeleteId } }); setConfirmDeleteId(null); }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
