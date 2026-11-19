import { useQuery } from "@apollo/client";
import { Link } from "react-router";
import { INCIDENTS_QUERY } from "../../graphql/incident";
import type { GqlIncident } from "../../types/generated";

const severities = [
  { value: "CRITICAL", label: "Critique" },
  { value: "HIGH", label: "Élevée" },
  { value: "MEDIUM", label: "Moyenne" },
  { value: "LOW", label: "Faible" },
] as const;

const statusLabels: Record<string, string> = {
  ACTIVE: "Actif",
  CONTAINED: "Contenu",
  CLOSED: "Clos",
};

export default function Cartographie() {
  const { data, loading, error, refetch } = useQuery<{
    incidents: GqlIncident[];
  }>(INCIDENTS_QUERY, {
    fetchPolicy: "cache-and-network",
  });

  const incidents = data?.incidents ?? [];

  return (
    <main className="min-h-full bg-[#0f1116] p-6 text-white">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">
              Cartographie des incidents
            </h1>
            <p className="mt-2 text-sm text-gray-400">
              Répartition par gravité et état.
              Données limitées à votre organisation.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void refetch()}
            className="rounded border border-gray-600 px-4 py-2 text-sm"
          >
            Actualiser
          </button>
        </header>

        {loading && !data && (
          <p role="status">Chargement des incidents…</p>
        )}

        {error && (
          <p role="alert" className="text-red-400">
            Impossible de charger les incidents.
          </p>
        )}

        {!loading && !error && incidents.length === 0 && (
          <p>Aucun incident à cartographier.</p>
        )}

        {(data?.incidents != null) && (
          <section
            aria-label="Répartition des incidents par gravité"
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
          >
            {severities.map((severity) => {
              const group = incidents.filter(
                (incident) => incident.severity === severity.value
              );

              return (
                <div
                  key={severity.value}
                  className="min-w-0 rounded-xl border border-[#303642] bg-[#151921] p-4"
                >
                  <h2 className="mb-1 font-semibold">
                    {severity.label}
                  </h2>
                  <p className="mb-4 text-sm text-gray-400">
                    {group.length} incident(s)
                  </p>

                  <div className="space-y-3">
                    {group.map((incident) => (
                      <Link
                        key={incident.id}
                        to={`/incidents/${incident.id}/dashboard`}
                        className="block rounded-lg border border-[#303642] p-3 hover:border-blue-500"
                      >
                        <p className="break-words font-medium">
                          {incident.name}
                        </p>
                        <p className="mt-1 text-xs text-gray-400">
                          {statusLabels[incident.status] ?? incident.status}
                        </p>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
