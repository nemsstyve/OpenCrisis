import { useQuery } from "@apollo/client";
import { Link } from "react-router";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  FolderOpen,
  Plus,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { INCIDENTS_QUERY } from "../../graphql/incident";
import { useAppStore } from "../../store/useAppStore";
import type { GqlIncident } from "../../types/generated";

const statusLabels: Record<GqlIncident["status"], string> = {
  ACTIVE: "Actif",
  CONTAINED: "Contenu",
  CLOSED: "Clos",
};

const severityLabels: Record<GqlIncident["severity"], string> = {
  LOW: "Faible",
  MEDIUM: "Moyenne",
  HIGH: "Elevee",
  CRITICAL: "Critique",
};

function StatCard({
  title,
  value,
  description,
  Icon,
}: {
  title: string;
  value: number;
  description: string;
  Icon: typeof Activity;
}) {
  return (
    <div className="rounded-xl border border-[#252a34] bg-[#151921] p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-400">{title}</p>
        <Icon className="h-5 w-5 text-blue-400" />
      </div>
      <p className="mt-4 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-xs text-gray-500">{description}</p>
    </div>
  );
}

export default function GlobalDashboard() {
  const currentUser = useAppStore((s) => s.currentUser);
  const canCreate = useAppStore((s) =>
    s.hasPermission("DASHBOARD", "WRITE")
  );

  const { data, loading, error, refetch } = useQuery<{
    incidents: GqlIncident[];
  }>(INCIDENTS_QUERY, {
    fetchPolicy: "cache-and-network",
  });

  const incidents = data?.incidents ?? [];
  const hasData = Array.isArray(data?.incidents);

  const active = incidents.filter(
    (incident) => incident.status === "ACTIVE"
  ).length;

  const contained = incidents.filter(
    (incident) => incident.status === "CONTAINED"
  ).length;

  const critical = incidents.filter(
    (incident) =>
      incident.severity === "CRITICAL" &&
      incident.status !== "CLOSED"
  ).length;

  const closed = incidents.filter(
    (incident) => incident.status === "CLOSED"
  ).length;

  const recent = [...incidents]
    .sort(
      (a, b) =>
        new Date(b.startedAt).getTime() -
        new Date(a.startedAt).getTime()
    )
    .slice(0, 6);

  return (
    <div className="min-h-full bg-[#0f1116] p-6 md:p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-blue-400">
              OpenCrisis / Vue generale
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-white">
              Tableau de bord general
            </h1>
            <p className="mt-2 text-sm text-gray-400">
              Bonjour{currentUser?.firstName
                ? `, ${currentUser.firstName}`
                : ""}. Vue d'ensemble des incidents et des crises.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-[#303642] px-4 py-2 text-sm text-gray-200 hover:bg-[#202630] disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" />
              Actualiser
            </button>

            {canCreate && (
              <Link
                to="/incidents"
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                Declarer un incident
              </Link>
            )}
          </div>
        </header>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300"
          >
            Impossible d'actualiser les incidents.
            {hasData && " Les dernieres donnees connues sont affichees."}
          </div>
        )}

        {!hasData && loading && (
          <div role="status" className="py-12 text-gray-400">
            Chargement des indicateurs...
          </div>
        )}

        {!hasData && error && (
          <div className="rounded-xl border border-[#252a34] p-6 text-gray-400">
            Les indicateurs sont indisponibles.
            Aucune valeur ne sera presentee comme reelle.
          </div>
        )}

        {hasData && (
          <>
            <section
              aria-label="Indicateurs des incidents"
              className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
            >
              <StatCard
                title="Incidents actifs"
                value={active}
                description="En cours de traitement"
                Icon={ShieldAlert}
              />
              <StatCard
                title="Incidents contenus"
                value={contained}
                description="Menace contenue, suivi en cours"
                Icon={Activity}
              />
              <StatCard
                title="Incidents critiques"
                value={critical}
                description="Critiques non clotures"
                Icon={AlertTriangle}
              />
              <StatCard
                title="Incidents clotures"
                value={closed}
                description="Historique de resolution"
                Icon={CheckCircle}
              />
            </section>

            <section className="rounded-xl border border-[#252a34] bg-[#151921]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#252a34] p-5">
                <div>
                  <h2 className="text-lg font-medium text-white">
                    Incidents recents
                  </h2>
                  <p className="mt-1 text-sm text-gray-500">
                    {incidents.length} incident(s) enregistre(s)
                  </p>
                </div>
                <Link
                  to="/incidents"
                  className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
                >
                  <FolderOpen className="h-4 w-4" />
                  Voir tous les incidents
                </Link>
              </div>

              {recent.length === 0 ? (
                <div className="flex flex-col items-center gap-3 px-5 py-14 text-center">
                  <CheckCircle className="h-10 w-10 text-gray-600" />
                  <h3 className="text-base font-medium text-white">
                    Aucun incident enregistre
                  </h3>
                  <p className="max-w-md text-sm text-gray-400">
                    Le tableau de bord est disponible sans incident.
                    Les indicateurs se mettront a jour lors des declarations.
                  </p>
                  {canCreate && (
                    <Link
                      to="/incidents"
                      className="mt-2 text-sm text-blue-400 hover:text-blue-300"
                    >
                      Acceder a la declaration d'incident
                    </Link>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-[#252a34]">
                  {recent.map((incident) => (
                    <Link
                      key={incident.id}
                      to={`/incidents/${encodeURIComponent(incident.id)}/dashboard`}
                      className="flex flex-wrap items-center justify-between gap-3 p-5 hover:bg-[#1c222c]"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-white">
                          {incident.name}
                        </p>
                        <p className="mt-1 flex items-center gap-2 text-xs text-gray-400">
                          <Clock className="h-3.5 w-3.5" />
                          {new Date(incident.startedAt).toLocaleString("fr-FR")}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="rounded-md bg-[#252a34] px-2 py-1 text-gray-300">
                          {severityLabels[incident.severity]}
                        </span>
                        <span className="text-blue-300">
                          {statusLabels[incident.status]}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
