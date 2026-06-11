import type { ComponentType } from "react";
import { useState } from "react";
import { AlertTriangle, Clock, Loader2, Shield, AlertCircle, CheckCircle, Lock, Settings, ChevronDown } from "lucide-react";
import { useQuery, useMutation } from "@apollo/client";
import { toast } from "sonner";
import { useCurrentIncident } from "../../hooks/useCurrentIncident";
import { useAppStore } from "../../store/useAppStore";
import { LOG_ENTRIES_QUERY } from "../../graphql/logEntry";
import { TIMELINE_EVENTS_QUERY } from "../../graphql/timeline";
import { UPDATE_INCIDENT_MUTATION, INCIDENT_QUERY } from "../../graphql/incident";
import type { GqlLogEntry, GqlTimelineEvent, GqlIncident, IncidentStatus, Severity, TimelineEventType } from "../../types/generated";

// ── Constantes de présentation ────────────────────────────────────────────────

const STATUS_LABEL: Record<IncidentStatus, string> = {
  ACTIVE: "En cours",
  CONTAINED: "Contenu",
  CLOSED: "Clos",
};
const STATUS_COLOR: Record<IncidentStatus, string> = {
  ACTIVE: "bg-red-500/10 text-red-400 border-red-500/30",
  CONTAINED: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  CLOSED: "bg-green-500/10 text-green-400 border-green-500/30",
};
const SEVERITY_COLOR: Record<Severity, string> = {
  LOW: "text-green-400",
  MEDIUM: "text-yellow-400",
  HIGH: "text-orange-400",
  CRITICAL: "text-red-400",
};

const TIMELINE_TYPE_ICON: Record<TimelineEventType, ComponentType<{ className?: string }>> = {
  DETECTION: AlertTriangle,
  ACTION: Shield,
  DECISION: AlertCircle,
  COMMUNICATION: Clock,
  ESCALATION: AlertTriangle,
  RESOLUTION: CheckCircle,
};
const TIMELINE_TYPE_COLOR: Record<TimelineEventType, string> = {
  DETECTION: "text-red-400",
  ACTION: "text-blue-400",
  DECISION: "text-purple-400",
  COMMUNICATION: "text-yellow-400",
  ESCALATION: "text-orange-400",
  RESOLUTION: "text-green-400",
};

// ── Composant MemberWidget (contributeurs par cellule) ────────────────────────

interface Contributor {
  id: string;
  name: string;
  initials: string;
  count: number;
  share: number; // 0–360
}

function ContributorsWidget({
  title,
  entries,
  color,
}: {
  title: string;
  entries: GqlLogEntry[];
  color: string;
}) {
  // Group by author, top 4
  const byAuthor = new Map<string, Contributor>();
  for (const e of entries) {
    const key = e.author.id;
    if (!byAuthor.has(key)) {
      const initials =
        (e.author.firstName[0] ?? "") + (e.author.lastName[0] ?? "");
      byAuthor.set(key, { id: key, name: `${e.author.firstName} ${e.author.lastName}`, initials, count: 0, share: 0 });
    }
    byAuthor.get(key)!.count++;
  }

  const total = entries.length || 1;
  const contributors = Array.from(byAuthor.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)
    .map((c) => ({ ...c, share: (c.count / total) * 360 }));

  if (contributors.length === 0) {
    return (
      <div className="bg-[#13151a] border border-[#1e2229] rounded-lg p-6">
        <h2 className="text-xl mb-4 text-white">{title}</h2>
        <p className="text-gray-500 text-sm text-center py-8">Aucune entrée pour cet incident</p>
      </div>
    );
  }

  const circumference = 2 * Math.PI * 40;

  return (
    <div className="bg-[#13151a] border border-[#1e2229] rounded-lg p-6">
      <h2 className="text-xl mb-4 text-white">{title}</h2>
      <p className="text-xs text-gray-500 mb-6">{entries.length} entrée(s) — top contributeurs</p>
      <div className="grid grid-cols-2 gap-6">
        {contributors.map((contributor) => {
          const dashOffset = circumference - (contributor.share / 360) * circumference;
          return (
            <div key={contributor.id} className="flex flex-col items-center">
              <div className="relative mb-3">
                <svg className="w-24 h-24 -rotate-90">
                  <circle
                    cx="48" cy="48" r="40"
                    fill="none" stroke="currentColor" strokeWidth="4"
                    className="text-gray-700"
                  />
                  <circle
                    cx="48" cy="48" r="40"
                    fill="none" stroke="currentColor" strokeWidth="4"
                    className={color}
                    strokeDasharray={`${circumference}`}
                    strokeDashoffset={`${dashOffset}`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center">
                    <span className="text-blue-400 text-sm font-medium">{contributor.initials}</span>
                  </div>
                </div>
              </div>
              <p className="text-sm text-center text-white">{contributor.name}</p>
              <p className="text-xs text-center text-gray-500 mt-1">
                {contributor.count} entrée{contributor.count > 1 ? "s" : ""}
              </p>
            </div>
          );
        })}
      </div>
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
  const { incidentId, incident } = useCurrentIncident();
  const hasPermission = useAppStore((s) => s.hasPermission);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [editModal, setEditModal] = useState(false);

  const canWrite = hasPermission("DASHBOARD", "WRITE");

  const [updateIncident, { loading: updating }] = useMutation<
    { updateIncident: GqlIncident },
    { id: string; input: { status?: IncidentStatus; name?: string; description?: string; severity?: Severity } }
  >(UPDATE_INCIDENT_MUTATION, {
    refetchQueries: [{ query: INCIDENT_QUERY, variables: { id: incidentId } }],
    onError: () => toast.error("Erreur lors de la mise à jour"),
  });

  async function handleStatusChange(status: IncidentStatus) {
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
  const now = new Date();
  const allPoints = [
    ...tlEvents.map((e) => ({ id: e.id, date: new Date(e.occurredAt), type: e.type, title: e.title, isCurrent: false })),
    { id: "__now__", date: now, type: "DETECTION" as TimelineEventType, title: "Maintenant", isCurrent: true },
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  return (
    <div className="p-8 bg-[#0f1116] min-h-screen">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl text-white mb-2">Tableau de bord</h1>
          <p className="text-gray-400">Vue d'ensemble de la situation de crise actuelle</p>
        </div>
        {incident && (
          <div className="flex items-center gap-3">
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
                    {(["ACTIVE", "CONTAINED", "CLOSED"] as IncidentStatus[]).map((s) => (
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

      {/* Widgets contributeurs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {canReadDir ? (
          <ContributorsWidget title="Cellule de Direction" entries={dirEntries} color="text-purple-500" />
        ) : (
          <AccessRestricted label="Cellule de Direction" />
        )}
        {canReadOps ? (
          <ContributorsWidget title="Cellule opérationnelle" entries={opsEntries} color="text-blue-500" />
        ) : (
          <AccessRestricted label="Cellule opérationnelle" />
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

const SEVERITY_OPTIONS: Severity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const SEVERITY_LABEL: Record<Severity, string> = {
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
  onSave: (input: { name?: string; description?: string; severity?: Severity }) => Promise<void>;
  saving: boolean;
}) {
  const [name, setName] = useState(incident.name);
  const [description, setDescription] = useState(incident.description ?? "");
  const [severity, setSeverity] = useState<Severity>(incident.severity);

  const inputCls = "w-full bg-[#1a1d24] border border-[#2a2e39] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500";

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-[#13151a] border border-[#1e2229] rounded-lg w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e2229]">
          <h2 className="text-white font-medium">Modifier l'incident</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
        </div>
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
            <select value={severity} onChange={(e) => setSeverity(e.target.value as Severity)} className={inputCls}>
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
      </div>
    </div>
  );
}
