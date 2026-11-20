import { useState } from "react";
import { useMutation, useQuery } from "@apollo/client";
import {
  PUBLISHED_THREATS_QUERY,
  MY_THREAT_SUBMISSIONS_QUERY,
  PENDING_THREAT_SUBMISSIONS_QUERY,
  PROPOSE_THREAT_MUTATION,
  DECIDE_THREAT_MUTATION,
  LINK_THREAT_MUTATION,
} from "../../graphql/sharedThreat";

interface SharedThreat {
  id: string;
  indicatorType: string;
  indicatorValue: string;
  title: string;
  mitigation: string;
  publishedAt: string;
}

interface Submission {
  id: string;
  indicatorType: string;
  indicatorValue: string;
  title: string;
  mitigation?: string;
  status: string;
  createdAt: string;
}

const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

const buttonClass =
  "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50";

const panelClass =
  "rounded-lg border border-border bg-card p-5 space-y-4";

export default function SharedThreatIntelligence() {
  const [iocId, setIocId] = useState("");
  const [title, setTitle] = useState("");
  const [mitigation, setMitigation] = useState("");
  const [incidentId, setIncidentId] = useState("");
  const [selectedThreatId, setSelectedThreatId] = useState("");
  const [rejectionReasons, setRejectionReasons] =
    useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const published = useQuery<{
    publishedThreats: SharedThreat[];
  }>(PUBLISHED_THREATS_QUERY, {
    fetchPolicy: "network-only",
  });

  const mine = useQuery<{
    myThreatSubmissions: Submission[];
  }>(MY_THREAT_SUBMISSIONS_QUERY, {
    fetchPolicy: "network-only",
  });

  const pending = useQuery<{
    pendingThreatSubmissions: Submission[];
  }>(PENDING_THREAT_SUBMISSIONS_QUERY, {
    fetchPolicy: "network-only",
  });

  const [propose] = useMutation(PROPOSE_THREAT_MUTATION);
  const [decide] = useMutation(DECIDE_THREAT_MUTATION);
  const [link] = useMutation(LINK_THREAT_MUTATION);

  async function refresh() {
    await Promise.allSettled([
      published.refetch(),
      mine.refetch(),
      pending.refetch(),
    ]);
  }

  async function runAction(
    action: () => Promise<unknown>,
    successMessage: string
  ) {
    if (busy) return;
    setBusy(true);
    setMessage("");

    try {
      await action();
      setMessage(successMessage);
      await refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Opération refusée"
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitThreat(event: React.FormEvent) {
    event.preventDefault();
    const id = iocId.trim();
    const name = title.trim();
    const action = mitigation.trim();

    if (!id || !name || !action) return;

    await runAction(
      () =>
        propose({
          variables: {
            iocId: id,
            title: name,
            mitigation: action,
          },
        }),
      "Proposition transmise pour validation."
    );
  }

  async function linkThreat(event: React.FormEvent) {
    event.preventDefault();

    if (!incidentId.trim() || !selectedThreatId) return;

    await runAction(
      async () => {
        const result = await link({
          variables: {
            incidentId: incidentId.trim(),
            threatId: selectedThreatId,
          },
        });

        if (result.data?.linkPublishedThreatToIncident !== true) {
          throw new Error("Association non confirmée par le serveur.");
        }
      },
      "Menace associée à l'incident."
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">
          Threat Intelligence — V0.3
        </h1>
        <p className="text-sm text-muted-foreground">
          Renseignement partagé, indicateurs de compromission
          et validation des contributions.
        </p>
      </header>

      {message && (
        <div
          role="status"
          className="rounded-md border border-border p-3 text-sm"
        >
          {message}
        </div>
      )}

      <section className={panelClass}>
        <h2 className="text-lg font-semibold">
          Menaces publiées
        </h2>

        {published.loading && <p>Chargement des menaces…</p>}
        {published.error && (
          <p role="alert" className="text-destructive">
            {published.error.message}
          </p>
        )}

        {!published.loading &&
          !published.error &&
          published.data?.publishedThreats.length === 0 && (
            <p>Aucune menace publiée.</p>
          )}

        <div className="space-y-3">
          {published.data?.publishedThreats.map((threat) => (
            <article
              key={threat.id}
              className="rounded-md border border-border p-4"
            >
              <h3 className="font-semibold">{threat.title}</h3>
              <p className="mt-1 break-all text-sm">
                <strong>{threat.indicatorType}</strong> :{" "}
                {threat.indicatorValue}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm">
                <strong>Mitigation :</strong> {threat.mitigation}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Publication : {threat.publishedAt}
              </p>
              <button
                type="button"
                className="mt-3 text-sm underline"
                onClick={() => setSelectedThreatId(threat.id)}
              >
                Associer à un incident
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className={panelClass}>
        <h2 className="text-lg font-semibold">
          Associer une menace à un incident
        </h2>

        <form onSubmit={(event) => void linkThreat(event)}
          className="space-y-3">
          <label className="block text-sm">
            Identifiant de l'incident
            <input
              className={inputClass}
              value={incidentId}
              onChange={(event) => setIncidentId(event.target.value)}
              required
            />
          </label>

          <label className="block text-sm">
            Menace publiée
            <select
              className={inputClass}
              value={selectedThreatId}
              onChange={(event) =>
                setSelectedThreatId(event.target.value)
              }
              required
            >
              <option value="">Sélectionner une menace</option>
              {published.data?.publishedThreats.map((threat) => (
                <option key={threat.id} value={threat.id}>
                  {threat.title} — {threat.indicatorValue}
                </option>
              ))}
            </select>
          </label>

          <button
            className={buttonClass}
            type="submit"
            disabled={busy}
          >
            Associer
          </button>
        </form>
      </section>

      <section className={panelClass}>
        <h2 className="text-lg font-semibold">
          Proposer une menace à partir d'un IoC
        </h2>

        <form
          onSubmit={(event) => void submitThreat(event)}
          className="space-y-3"
        >
          <label className="block text-sm">
            Identifiant d'un IoC existant
            <input
              className={inputClass}
              value={iocId}
              onChange={(event) => setIocId(event.target.value)}
              required
            />
          </label>

          <label className="block text-sm">
            Titre de la menace
            <input
              className={inputClass}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </label>

          <label className="block text-sm">
            Mesures de mitigation
            <textarea
              className={inputClass}
              value={mitigation}
              onChange={(event) =>
                setMitigation(event.target.value)
              }
              rows={3}
              required
            />
          </label>

          <button
            className={buttonClass}
            type="submit"
            disabled={busy}
          >
            Soumettre pour validation
          </button>
        </form>
      </section>

      <section className={panelClass}>
        <h2 className="text-lg font-semibold">
          Mes propositions
        </h2>

        {mine.loading && <p>Chargement…</p>}
        {mine.error && (
          <p role="alert" className="text-destructive">
            {mine.error.message}
          </p>
        )}

        {mine.data?.myThreatSubmissions.length === 0 && (
          <p>Aucune proposition.</p>
        )}

        {mine.data?.myThreatSubmissions.map((item) => (
          <div
            key={item.id}
            className="rounded-md border border-border p-3 text-sm"
          >
            <strong>{item.title}</strong> — {item.status}
            <p>{item.indicatorValue}</p>
          </div>
        ))}
      </section>

      <section className={panelClass}>
        <h2 className="text-lg font-semibold">
          Propositions à modérer
        </h2>

        {pending.loading && <p>Chargement…</p>}
        {pending.error && (
          <p className="text-sm text-muted-foreground">
            Liste de modération indisponible ou accès non autorisé.
          </p>
        )}

        {pending.data?.pendingThreatSubmissions.length === 0 && (
          <p>Aucune proposition en attente.</p>
        )}

        {pending.data?.pendingThreatSubmissions.map((item) => (
          <article
            key={item.id}
            className="space-y-3 rounded-md border border-border p-4"
          >
            <h3 className="font-semibold">{item.title}</h3>
            <p className="break-all text-sm">
              {item.indicatorType} : {item.indicatorValue}
            </p>
            <p className="whitespace-pre-wrap text-sm">
              {item.mitigation}
            </p>

            <label className="block text-sm">
              Motif de refus
              <input
                className={inputClass}
                value={rejectionReasons[item.id] ?? ""}
                onChange={(event) =>
                  setRejectionReasons((previous) => ({
                    ...previous,
                    [item.id]: event.target.value,
                  }))
                }
              />
            </label>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className={buttonClass}
                disabled={busy}
                onClick={() =>
                  void runAction(
                    () =>
                      decide({
                        variables: {
                          submissionId: item.id,
                          approve: true,
                          reason: null,
                        },
                      }),
                    "Proposition approuvée."
                  )
                }
              >
                Approuver
              </button>

              <button
                type="button"
                className="rounded-md border px-4 py-2 text-sm disabled:opacity-50"
                disabled={
                  busy || !(rejectionReasons[item.id] ?? "").trim()
                }
                onClick={() =>
                  void runAction(
                    () =>
                      decide({
                        variables: {
                          submissionId: item.id,
                          approve: false,
                          reason: rejectionReasons[item.id].trim(),
                        },
                      }),
                    "Proposition refusée."
                  )
                }
              >
                Refuser
              </button>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
