import type { ComponentType } from "react";
import { AlertTriangle, Clock, Loader2, Shield, AlertCircle, CheckCircle, Lock } from "lucide-react";
import { useQuery } from "@apollo/client";
import { useCurrentIncident } from "../../hooks/useCurrentIncident";
import { useAppStore } from "../../store/useAppStore";
import { LOG_ENTRIES_QUERY } from "../../graphql/logEntry";
import { TIMELINE_EVENTS_QUERY } from "../../graphql/timeline";
import type { GqlLogEntry, GqlTimelineEvent, IncidentStatus, Severity, TimelineEventType } from "../../types/generated";

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
            <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${STATUS_COLOR[incident.status]}`}>
              {STATUS_LABEL[incident.status]}
            </span>
            <span className={`text-sm font-medium ${SEVERITY_COLOR[incident.severity]}`}>
              {incident.severity}
            </span>
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
    </div>
  );
}
