import type { ComponentType } from "react";
import { useState, useEffect } from "react";
import { AlertTriangle, Clock, Loader2, Shield, AlertCircle, CheckCircle, Lock, Settings, ChevronDown } from "lucide-react";
import { useQuery, useMutation } from "@apollo/client";
import { EXPORT_INCIDENT_TO_OPENCTI_MUTATION } from "../../graphql/incident";
import { OPENCTI_STATUS_QUERY } from "../../graphql/timeline";
import { toast } from "sonner";
import { useCurrentIncident } from "../../hooks/useCurrentIncident";
import { useAppStore } from "../../store/useAppStore";
import { FormModal } from "../components/FormModal";
import { LOG_ENTRIES_QUERY } from "../../graphql/logEntry";
import { TIMELINE_EVENTS_QUERY } from "../../graphql/timeline";
import { UPDATE_INCIDENT_MUTATION, INCIDENT_QUERY } from "../../graphql/incident";
import type { GqlLogEntry, GqlTimelineEvent, GqlIncident, GqlIncidentStatus, GqlSeverity, GqlTimelineEventType } from "../../types/generated";

// ── Constantes de présentation ────────────────────────────────────────────────

const STATUS_LABEL: Record<GqlIncidentStatus, string> = {
  ACTIVE: "En cours",
  CONTAINED: "Contenu",
  CLOSED: "Clos",
};
const STATUS_COLOR: Record<GqlIncidentStatus, string> = {
  ACTIVE: "bg-red-500/10 text-red-400 border-red-500/30",
  CONTAINED: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  CLOSED: "bg-green-500/10 text-green-400 border-green-500/30",
};
const SEVERITY_COLOR: Record<GqlSeverity, string> = {
  LOW: "text-green-400",
  MEDIUM: "text-yellow-400",
  HIGH: "text-orange-400",
  CRITICAL: "text-red-400",
};

const TIMELINE_TYPE_ICON: Record<GqlTimelineEventType, ComponentType<{ className?: string }>> = {
  DETECTION: AlertTriangle,
  ACTION: Shield,
  DECISION: AlertCircle,
  COMMUNICATION: Clock,
  ESCALATION: AlertTriangle,
  RESOLUTION: CheckCircle,
};
const TIMELINE_TYPE_COLOR: Record<GqlTimelineEventType, string> = {
  DETECTION: "text-red-400",
  ACTION: "text-blue-400",
  DECISION: "text-purple-400",
  COMMUNICATION: "text-yellow-400",
  ESCALATION: "text-orange-400",
  RESOLUTION: "text-green-400",
};

// ── Widget compte à rebours légal (72h) ────────────────────────────────────────

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);
  return now;
}

function DeadlineWidget({ label, deadline, now }: { label: string; deadline: Date | null; now: Date }) {
  if (!deadline) {
    return (
      <div className="bg-[#13151a] border border-[#1e2229] rounded-lg p-6">
        <h2 className="text-sm text-gray-400 mb-2">{label}</h2>
        <p className="text-gray-500 text-sm">En attente de la première détection</p>
      </div>
    );
  }

  const remainingMs = deadline.getTime() - now.getTime();
  const overdue = remainingMs <= 0;
  const abs = Math.abs(remainingMs);
  const hours = Math.floor(abs / 3_600_000);
  const minutes = Math.floor((abs % 3_600_000) / 60_000);
  const seconds = Math.floor((abs % 60_000) / 1000);
  const pad = (n: number) => n.toString().padStart(2, "0");

  return (
    <div className="bg-[#13151a] border border-[#1e2229] rounded-lg p-6">
      <h2 className="text-sm text-gray-400 mb-2">{label}</h2>
      <p className={`text-3xl font-light ${overdue ? "text-red-400" : "text-white"}`}>
        {overdue ? "Délai dépassé" : `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`}
      </p>
      <p className="text-xs text-gray-500 mt-2">
        Échéance :{" "}
        {deadline.toLocaleString("fr-FR", {
          day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
        })}
      </p>
    </div>
  );
}

// ── Bloc "Accès restreint" ────────────────────────────────────────────────────

function AccessRestricted({ label }: { label: string }) {
  return (
    <div className="bg-[#13151a] border border-[#1e2229] rounded-lg p-6 flex flex-col items-center justify-center gap-2 min-h-[120px]">
      <Lock className="w-5 h-5 text-gray-600" />
      <p className="text-gray-500 text-sm">{label} — accès restreint</p>
    </div>
  );
}

// ── Page Dashboard ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [exportingOCTI, setExportingOCTI] = useState(false);
  const { data: octiStatus } = useQuery(OPENCTI_STATUS_QUERY);
  const openctiEnabled = octiStatus?.openctiStatus ?? false;
  const [exportToOpenCTI] = useMutation(EXPORT_INCIDENT_TO_OPENCTI_MUTATION);
  const { incidentId, incident } = useCurrentIncident();
  const hasPermission = useAppStore((s) => s.hasPermission);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const now = useNow();

  const canWrite = hasPermission("DASHBOARD", "WRITE");

  const [updateIncident, { loading: updating }] = useMutation<
    { updateIncident: GqlIncident },
    { id: string; input: { status?: GqlIncidentStatus; name?: string; description?: string; severity?: GqlSeverity } }
  >(UPDATE_INCIDENT_MUTATION, {
    refetchQueries: [{ query: INCIDENT_QUERY, variables: { id: incidentId } }],
    onError: () => toast.error("Erreur lors de la mise à jour"),
  });

  async function handleStatusChange(status: GqlIncidentStatus) {
    setShowStatusMenu(false);
    await updateIncident({ variables: { id: incidentId, input: { status } } });
    toast.success(`Statut mis à jour : ${STATUS_LABEL[status]}`);
  }

  // III1 — ne requête que les cellules accessibles
  const canReadDir = hasPermission("MAIN_COURANTE_DIR", "READ");
  const canReadOps = hasPermission("MAIN_COURANTE_OPS", "READ");
  const canReadTimeline = hasPermission("TIMELINE", "READ");

  const { data: dirData, loading: dirLoading } = useQuery<{ logEntries: GqlLogEntry[] }>(
    LOG_ENTRIES_QUERY,
    { variables: { incidentId, cell: "DIRECTIONAL" }, skip: !incidentId || !canReadDir }
  );
  const { data: opsData, loading: opsLoading } = useQuery<{ logEntries: GqlLogEntry[] }>(
    LOG_ENTRIES_QUERY,
    { variables: { incidentId, cell: "OPERATIONAL" }, skip: !incidentId || !canReadOps }
  );
  const { data: tlData, loading: tlLoading } = useQuery<{ timelineEvents: GqlTimelineEvent[] }>(
    TIMELINE_EVENTS_QUERY,
    { variables: { incidentId }, skip: !incidentId || !canReadTimeline }
  );

  const dirEntries = dirData?.logEntries ?? [];
  const opsEntries = opsData?.logEntries ?? [];
  const tlEvents = [...(tlData?.timelineEvents ?? [])].sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()
  );

  const isLoading = (canReadDir && dirLoading) || (canReadOps && opsLoading) || (canReadTimeline && tlLoading);

  // Build timeline bar: real events + "now" marker
  const allPoints = [
    ...tlEvents.map((e) => ({ id: e.id, date: new Date(e.occurredAt), type: e.type, title: e.title, isCurrent: false })),
    { id: "__now__", date: now, type: "DETECTION" as GqlTimelineEventType, title: "Maintenant", isCurrent: true },
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  // Décompte légal de 72h (notification CNIL, dépôt de plainte) à partir de la
  // première détection marquée sur la timeline
  const firstDetection = tlEvents.find((e) => e.isFirstDetection) ?? null;
  const legalDeadline = firstDetection
    ? new Date(new Date(firstDetection.occurredAt).getTime() + 72 * 3_600_000)
    : null;

  return (
    <div className="p-8 bg-[#0f1116] min-h-screen">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl text-white mb-2">Tableau de bord</h1>
          <p className="text-gray-400">Vue d'ensemble de la situation de crise actuelle</p>
        </div>
        {incident && openctiEnabled && (
            <button
              onClick={async () => {
                if (exportingOCTI) return;
                setExportingOCTI(true);
                try {
                  const res = await exportToOpenCTI({ variables: { incidentId: incident.id } });
                  const name = res.data?.exportIncidentToOpenCTI?.name ?? "Case";
                  toast.success("Exporté vers OpenCTI : " + name);
                } catch (e) {
                  toast.error("Erreur export OpenCTI");
                } finally { setExportingOCTI(false); }
              }}
              disabled={exportingOCTI}
              className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-3 py-1.5 rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              <span className="text-xs">⬡</span>
              {exportingOCTI ? "Export..." : "OpenCTI"}
            </button>
          )}
      {incident && (
          <div className="flex items-center gap-3 flex-wrap">
            {canWrite ? (
              <div className="relative">
                <button
                  onClick={() => setShowStatusMenu((v) => !v)}
                  className={`text-xs px-2.5 py-1 rounded-full border font-medium flex items-center gap-1 hover:opacity-80 transition-opacity ${STATUS_COLOR[incident.status]}`}
                  disabled={updating}
                >
                  {STATUS_LABEL[incident.status]}
                  <ChevronDown className="w-3 h-3" />
                </button>
                {showStatusMenu && (
                  <div className="absolute right-0 top-full mt-1 bg-[#1a1d24] border border-[#1e2229] rounded-lg shadow-xl z-20 overflow-hidden w-36">
                    {(["ACTIVE", "CONTAINED", "CLOSED"] as GqlIncidentStatus[]).map((s) => (
                      <button
                        key={s}
                        onClick={() => handleStatusChange(s)}
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-[#2a2e39] transition-colors ${incident.status === s ? "text-white font-medium" : "text-gray-400"}`}
                      >
                        {STATUS_LABEL[s]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${STATUS_COLOR[incident.status]}`}>
                {STATUS_LABEL[incident.status]}
              </span>
            )}
            <span className={`text-sm font-medium ${SEVERITY_COLOR[incident.severity]}`}>
              {incident.severity}
            </span>
            {canWrite && (
              <button
                onClick={() => setEditModal(true)}
                className="p-1.5 border border-[#1e2229] rounded hover:bg-[#1e2229] text-gray-400 hover:text-white transition-colors"
                title="Modifier l'incident"
                aria-label="Modifier l'incident"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Entrées direction", value: dirEntries.length, loading: dirLoading, color: "text-purple-400", allowed: canReadDir },
          { label: "Entrées opérationnelles", value: opsEntries.length, loading: opsLoading, color: "text-blue-400", allowed: canReadOps },
          { label: "Événements timeline", value: tlEvents.length, loading: tlLoading, color: "text-green-400", allowed: canReadTimeline },
          {
            label: "Contributeurs",
            value: new Set([...dirEntries, ...opsEntries].map((e) => e.author.id)).size,
            loading: isLoading,
            color: "text-yellow-400",
            allowed: canReadDir || canReadOps,
          },
        ].map((stat) => (
          <div key={stat.label} className="bg-[#13151a] border border-[#1e2229] rounded-lg p-5">
            <p className="text-gray-400 text-sm mb-2">{stat.label}</p>
            {!stat.allowed ? (
              <Lock className="w-4 h-4 text-gray-600" />
            ) : stat.loading ? (
              <Loader2 className="w-5 h-5 text-gray-600 animate-spin" />
            ) : (
              <p className={`text-3xl font-light ${stat.color}`}>{stat.value}</p>
            )}
          </div>
        ))}
      </div>

      {/* Échéances légales (72h) */}
      {canReadTimeline ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <DeadlineWidget label="Notification à la CNIL (72h)" deadline={legalDeadline} now={now} />
          <DeadlineWidget label="Porter plainte (72h)" deadline={legalDeadline} now={now} />
        </div>
      ) : (
        <div className="mb-8">
          <AccessRestricted label="Échéances légales" />
        </div>
      )}

      {/* Frise chronologique */}
      <div className="bg-[#13151a] border border-[#1e2229] rounded-lg p-8 mb-8">
        <h2 className="text-xl text-white mb-8">Frise chronologique</h2>
        {!canReadTimeline ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8">
            <Lock className="w-5 h-5 text-gray-600" />
            <p className="text-gray-500 text-sm">Timeline — accès restreint</p>
          </div>
        ) : tlLoading ? (
          <div className="flex items-center justify-center py-8 text-gray-500 gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Chargement…</span>
          </div>
        ) : null}
        {canReadTimeline && !tlLoading && allPoints.length <= 1 && (
          <p className="text-center text-gray-500 text-sm py-4">
            Aucun événement timeline pour cet incident.
          </p>
        )}
        {canReadTimeline && !tlLoading && allPoints.length > 1 && (
          <div className="relative">
            {/* Ligne horizontale */}
            <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-[#1e2229] -translate-y-1/2" />
            <div className="relative flex justify-between items-center">
              {allPoints.map((point) => {
                const Icon = point.isCurrent ? Clock : TIMELINE_TYPE_ICON[point.type];
                const colorClass = point.isCurrent
                  ? "text-green-400"
                  : TIMELINE_TYPE_COLOR[point.type];
                return (
                  <div key={point.id} className="flex flex-col items-center group" style={{ flex: "1 1 0", minWidth: 0 }}>
                    <div className="relative z-10 mb-4">
                      {point.isCurrent ? (
                        <div className="w-6 h-6 bg-green-500 rounded-full animate-pulse flex items-center justify-center">
                          <div className="w-3 h-3 bg-white rounded-full" />
                        </div>
                      ) : (
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${colorClass} bg-current/10`}>
                          <Icon className="w-3.5 h-3.5 text-current" />
                        </div>
                      )}
                    </div>
                    <div className="text-center px-1 max-w-[120px]">
                      <p className="text-xs text-white truncate" title={point.title}>{point.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {point.date.toLocaleString("fr-FR", {
                          day: "2-digit", month: "2-digit",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Overlay fermeture menu statut */}
      {showStatusMenu && (
        <div className="fixed inset-0 z-10" onClick={() => setShowStatusMenu(false)} />
      )}

      {/* Modale édition incident */}
      {editModal && incident && (
        <EditIncidentModal
          incident={incident}
          onClose={() => setEditModal(false)}
          onSave={async (input) => {
            await updateIncident({ variables: { id: incidentId, input } });
            toast.success("Incident mis à jour");
            setEditModal(false);
          }}
          saving={updating}
        />
      )}
    </div>
  );
}

// ── Modale édition incident ───────────────────────────────────────────────────

const SEVERITY_OPTIONS: GqlSeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const SEVERITY_LABEL: Record<GqlSeverity, string> = {
  LOW: "Faible", MEDIUM: "Moyen", HIGH: "Élevé", CRITICAL: "Critique",
};

function EditIncidentModal({
  incident,
  onClose,
  onSave,
  saving,
}: {
  incident: GqlIncident;
  onClose: () => void;
  onSave: (input: { name?: string; description?: string; severity?: GqlSeverity }) => Promise<void>;
  saving: boolean;
}) {
  const [name, setName] = useState(incident.name);
  const [description, setDescription] = useState(incident.description ?? "");
  const [severity, setSeverity] = useState<GqlSeverity>(incident.severity);

  const inputCls = "w-full bg-[#1a1d24] border border-[#2a2e39] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500";

  return (
    <FormModal open onClose={onClose} title="Modifier l'incident">
      <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Nom *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} required />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Sévérité</label>
            <select value={severity} onChange={(e) => setSeverity(e.target.value as GqlSeverity)} className={inputCls}>
              {SEVERITY_OPTIONS.map((s) => (
                <option key={s} value={s}>{SEVERITY_LABEL[s]}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-[#1e2229]">
          <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white text-sm">Annuler</button>
          <button
            onClick={() => onSave({ name, description: description || undefined, severity })}
            disabled={saving || !name.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enregistrer"}
          </button>
        </div>
    </FormModal>
  );
}
