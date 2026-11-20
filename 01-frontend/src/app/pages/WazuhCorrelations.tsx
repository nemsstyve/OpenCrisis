import { useState } from "react";
import { useQuery } from "@apollo/client";
import { WAZUH_CORRELATIONS_QUERY } from "../../graphql/wazuhCorrelation";

interface WazuhThreatMatch {
  threatId: string;
  indicatorType: string;
  indicatorValue: string;
  score: number;
  rationale: string;
  mitigation: string;
}

interface WazuhCorrelation {
  id: string;
  sourceId: string;
  externalEventId: string;
  matched: boolean;
  confidence: number;
  correlatedAt: string;
  analystReviewRequired: boolean;
  incidentAutomaticallyCreated: boolean;
  matches: WazuhThreatMatch[];
}

interface CorrelationsData {
  wazuhCorrelations: WazuhCorrelation[];
}

type Filter = "ALL" | "MATCHED" | "UNMATCHED";

function displayDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("fr-FR");
}

export default function WazuhCorrelations() {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [search, setSearch] = useState("");

  const { data, loading, error, refetch, networkStatus } =
    useQuery<CorrelationsData>(WAZUH_CORRELATIONS_QUERY, {
      variables: { limit: 100 },
      fetchPolicy: "network-only",
      notifyOnNetworkStatusChange: true,
    });

  const records = data?.wazuhCorrelations ?? [];
  const normalizedSearch = search.trim().toLowerCase();

  const visible = records.filter((record) => {
    if (filter === "MATCHED" && !record.matched) return false;
    if (filter === "UNMATCHED" && record.matched) return false;

    if (!normalizedSearch) return true;

    return [
      record.sourceId,
      record.externalEventId,
      ...record.matches.flatMap((match) => [
        match.indicatorValue,
        match.indicatorType,
        match.threatId,
      ]),
    ].some((value) =>
      value.toLowerCase().includes(normalizedSearch)
    );
  });

  const matchedCount = records.filter((r) => r.matched).length;

  const panel =
    "rounded-lg border border-border bg-card p-5";

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">
            Corrélations SOC
          </h1>
          <p className="text-sm text-muted-foreground">
            Correspondances entre alertes Wazuh et menaces
            partagées approuvées.
          </p>
        </div>

        <button
          type="button"
          className="rounded-md border border-border px-4 py-2 text-sm disabled:opacity-50"
          disabled={networkStatus === 4}
          onClick={() => void refetch()}
        >
          {networkStatus === 4
            ? "Actualisation..."
            : "Actualiser"}
        </button>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className={panel}>
          <p className="text-sm text-muted-foreground">
            Corrélations enregistrées
          </p>
          <p className="mt-2 text-2xl font-semibold">
            {records.length}
          </p>
        </div>

        <div className={panel}>
          <p className="text-sm text-muted-foreground">
            Avec correspondance
          </p>
          <p className="mt-2 text-2xl font-semibold">
            {matchedCount}
          </p>
        </div>

        <div className={panel}>
          <p className="text-sm text-muted-foreground">
            Sans correspondance
          </p>
          <p className="mt-2 text-2xl font-semibold">
            {records.length - matchedCount}
          </p>
        </div>
      </section>

      <p className="text-xs text-muted-foreground">
        Indicateurs calculés sur les 100 derniers enregistrements
        accessibles à votre entreprise, et non sur tout
        l'historique.
      </p>

      <section className={panel}>
        <h2 className="mb-4 text-lg font-semibold">
          Explorer les résultats
        </h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1 text-sm">
            <span>Correspondances</span>
            <select
              value={filter}
              onChange={(event) =>
                setFilter(event.target.value as Filter)
              }
              className="w-full rounded-md border border-border bg-background px-3 py-2"
            >
              <option value="ALL">Toutes</option>
              <option value="MATCHED">Avec correspondance</option>
              <option value="UNMATCHED">Sans correspondance</option>
            </select>
          </label>

          <label className="block space-y-1 text-sm">
            <span>Rechercher dans les résultats affichés</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Source, alerte, domaine, hash..."
              className="w-full rounded-md border border-border bg-background px-3 py-2"
            />
          </label>
        </div>
      </section>

      {loading && records.length === 0 && (
        <p role="status">Chargement des corrélations...</p>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive p-4 text-sm text-destructive"
        >
          Impossible de consulter les corrélations :
          {" "}{error.message}
        </div>
      )}

      {!loading && !error && visible.length === 0 && (
        <div className={panel}>
          <p className="text-sm text-muted-foreground">
            Aucun résultat disponible pour le moment.
            Les corrélations apparaîtront ici dès leur enregistrement.

          </p>
        </div>
      )}

      {!error && (
        <section className="space-y-4" aria-label="Résultats de corrélation">
          {visible.map((record) => (
            <article
              key={record.id}
              className={panel + " space-y-4"}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <h3 className="font-semibold">
                    Alerte {record.externalEventId}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Source : {record.sourceId}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {displayDate(record.correlatedAt)}
                  </p>
                </div>

                <span
                  className={
                    "rounded-full border px-3 py-1 text-xs font-medium " +
                    (record.matched
                      ? "border-amber-500 text-amber-700 dark:text-amber-400"
                      : "border-border text-muted-foreground")
                  }
                >
                  {record.matched
                    ? "Correspondance détectée"
                    : "Aucune correspondance"}
                </span>
              </div>

              <div className="text-sm">
                <strong>Score de correspondance :</strong>{" "}
                {record.confidence}/100
              </div>

              <p className="text-xs text-muted-foreground">
                Ce score mesure la correspondance avec un
                indicateur publié. Ce n'est pas une probabilité
                de compromission.
              </p>

              {record.matches.map((match, index) => (
                <div
                  key={`${match.threatId}-${index}`}
                  className="space-y-2 rounded-md border border-border p-4"
                >
                  <p className="text-sm font-semibold">
                    {match.indicatorType} — Score {match.score}
                  </p>

                  <p className="break-all font-mono text-xs">
                    {match.indicatorValue}
                  </p>

                  <p className="text-sm">
                    <strong>Justification :</strong>{" "}
                    {match.rationale}
                  </p>

                  <p className="whitespace-pre-wrap text-sm">
                    <strong>Mitigation recommandée :</strong>{" "}
                    {match.mitigation}
                  </p>

                  <p className="text-xs text-muted-foreground">
                    Référence menace : {match.threatId}
                  </p>
                </div>
              ))}

              {record.analystReviewRequired && (
                <p className="rounded-md border border-border p-3 text-sm">
                  Revue humaine requise. Cette corrélation ne
                  constitue pas à elle seule un incident confirmé.
                </p>
              )}

              {!record.incidentAutomaticallyCreated && (
                <p className="text-xs text-muted-foreground">
                  Aucun incident créé automatiquement par
                  cette corrélation.
                </p>
              )}
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
