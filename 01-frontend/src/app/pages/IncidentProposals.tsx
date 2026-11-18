import { useState } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { AlertTriangle, Check, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";

import { useAppStore } from "../../store/useAppStore";
import {
  INCIDENT_PROPOSALS_QUERY,
  APPROVE_INCIDENT_PROPOSAL_MUTATION,
  REJECT_INCIDENT_PROPOSAL_MUTATION,
} from "../../graphql/incidentProposal";

type ProposalStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CONVERTED";

type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

interface IncidentProposal {
  id: string;
  sourceType: string;
  sourceId: string;
  externalEventId: string;
  title: string;
  description: string | null;
  severity: Severity;
  status: ProposalStatus;
  receivedAt: string;
  incidentId: string | null;
}

interface ProposalQueryData {
  incidentProposals: IncidentProposal[];
}

const statusLabels: Record<ProposalStatus, string> = {
  PENDING: "En attente",
  APPROVED: "Approuvée",
  REJECTED: "Rejetée",
  CONVERTED: "Convertie en incident",
};

const severityLabels: Record<Severity, string> = {
  LOW: "Faible",
  MEDIUM: "Moyenne",
  HIGH: "Élevée",
  CRITICAL: "Critique",
};

const severityStyles: Record<Severity, string> = {
  LOW: "bg-blue-500/10 text-blue-600 dark:text-blue-300",
  MEDIUM: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  HIGH: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  CRITICAL: "bg-red-500/10 text-red-700 dark:text-red-300",
};

function displayDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date indisponible"
    : date.toLocaleString("fr-FR");
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Une erreur est survenue.";
}

export default function IncidentProposals() {
  const hasPermission = useAppStore((state) => state.hasPermission);
  const canRead = hasPermission("DASHBOARD", "READ");
  const canWrite = hasPermission("DASHBOARD", "WRITE");

  const [status, setStatus] = useState<ProposalStatus | "ALL">(
    "PENDING"
  );
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const { data, loading, error, refetch } =
    useQuery<ProposalQueryData>(INCIDENT_PROPOSALS_QUERY, {
      variables: {
        status: status === "ALL" ? null : status,
        limit: 50,
      },
      skip: !canRead,
      fetchPolicy: "network-only",
      notifyOnNetworkStatusChange: true,
    });

  const [approve, { loading: approving }] = useMutation(
    APPROVE_INCIDENT_PROPOSAL_MUTATION
  );

  const [reject, { loading: rejecting }] = useMutation(
    REJECT_INCIDENT_PROPOSAL_MUTATION
  );

  const busy = approving || rejecting;

  async function approveProposal(id: string) {
    if (!canWrite || busy) return;

    const confirmed = window.confirm(
      "Confirmer la création d'un incident à partir de cette proposition ?"
    );
    if (!confirmed) return;

    try {
      const result = await approve({
        variables: { id },
      });

      if (result.errors?.length ||
          !result.data?.approveIncidentProposal?.incidentId) {
        throw new Error("Approbation non confirmée par le serveur.");
      }

      toast.success("Incident créé après approbation.");
      await refetch();
    } catch (mutationError) {
      toast.error(errorMessage(mutationError));
    }
  }

  async function rejectProposal() {
    if (!canWrite || busy || !rejectId) return;

    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      toast.error("Le motif du rejet est obligatoire.");
      return;
    }

    try {
      const result = await reject({
        variables: {
          id: rejectId,
          reason: trimmedReason,
        },
      });

      if (result.errors?.length ||
          !result.data?.rejectIncidentProposal?.proposalId) {
        throw new Error("Rejet non confirmé par le serveur.");
      }

      setRejectId(null);
      setReason("");
      toast.success("Proposition rejetée.");
      await refetch();
    } catch (mutationError) {
      toast.error(errorMessage(mutationError));
    }
  }

  if (!canRead) {
    return (
      <div className="p-8 text-red-600" role="alert">
        Accès refusé : permission DASHBOARD/READ requise.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            Propositions d'incidents
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Analyse humaine des alertes avant création d'incidents.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void refetch()}
          disabled={loading || busy}
          className="inline-flex items-center gap-2 rounded-lg border
            border-gray-300 dark:border-gray-700 px-4 py-2
            disabled:opacity-50"
        >
          <RefreshCw size={16} />
          Actualiser
        </button>
      </header>

      <section aria-label="Filtrer les propositions">
        <label htmlFor="proposal-status" className="block mb-2 text-sm">
          Statut
        </label>
        <select
          id="proposal-status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as ProposalStatus | "ALL");
            setRejectId(null);
            setReason("");
          }}
          className="rounded-lg border border-gray-300 bg-white
            dark:bg-gray-900 dark:border-gray-700 px-3 py-2"
        >
          <option value="PENDING">En attente</option>
          <option value="CONVERTED">Converties</option>
          <option value="REJECTED">Rejetées</option>
          <option value="APPROVED">Approuvées</option>
          <option value="ALL">Tous les statuts</option>
        </select>
      </section>

      {loading && (
        <p role="status" className="text-sm text-gray-500">
          Chargement des propositions…
        </p>
      )}

      {error && (
        <div role="alert" className="rounded-lg border border-red-500/30 p-4">
          <div className="flex items-center gap-2 text-red-600">
            <AlertTriangle size={18} />
            Impossible de charger les propositions.
          </div>
          <p className="mt-2 text-sm">{error.message}</p>
        </div>
      )}

      {!loading && !error &&
        data?.incidentProposals.length === 0 && (
          <div className="rounded-lg border border-gray-200
            dark:border-gray-700 p-8 text-center text-gray-500">
            Aucune proposition pour ce filtre.
          </div>
        )}

      <div className="grid gap-4">
        {data?.incidentProposals.map((proposal) => (
          <article
            key={proposal.id}
            className="rounded-xl border border-gray-200
              dark:border-gray-700 bg-white dark:bg-gray-900 p-5"
          >
            <div className="flex flex-wrap justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-medium break-words">
                  {proposal.title}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  {proposal.sourceType} · {proposal.sourceId}
                </p>
              </div>
              <div className="flex flex-wrap items-start gap-2">
                <span className={
                  "rounded-full px-3 py-1 text-xs font-medium " +
                  severityStyles[proposal.severity]
                }>
                  {severityLabels[proposal.severity]}
                </span>
                <span className="rounded-full bg-gray-100
                  dark:bg-gray-800 px-3 py-1 text-xs">
                  {statusLabels[proposal.status]}
                </span>
              </div>
            </div>

            {proposal.description && (
              <p className="mt-3 whitespace-pre-wrap break-words text-sm">
                {proposal.description}
              </p>
            )}

            <dl className="mt-4 grid gap-2 text-xs text-gray-500 sm:grid-cols-2">
              <div>
                <dt className="font-medium">Événement externe</dt>
                <dd className="break-all">
                  {proposal.externalEventId}
                </dd>
              </div>
              <div>
                <dt className="font-medium">Réception</dt>
                <dd>{displayDate(proposal.receivedAt)}</dd>
              </div>
            </dl>

            {proposal.incidentId && (
              <p className="mt-3 text-sm">
                Incident créé :{" "}
                <span className="font-mono break-all">
                  {proposal.incidentId}
                </span>
              </p>
            )}

            {proposal.status === "PENDING" && canWrite && (
              <div className="mt-5 border-t border-gray-200
                dark:border-gray-700 pt-4">
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void approveProposal(proposal.id)}
                    className="inline-flex items-center gap-2 rounded-lg
                      bg-emerald-700 px-4 py-2 text-white
                      hover:bg-emerald-800 disabled:opacity-50"
                  >
                    <Check size={16} />
                    Approuver et créer l'incident
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setRejectId(
                        rejectId === proposal.id ? null : proposal.id
                      );
                      setReason("");
                    }}
                    className="inline-flex items-center gap-2 rounded-lg
                      border border-red-500/40 px-4 py-2
                      text-red-600 disabled:opacity-50"
                  >
                    <X size={16} />
                    Rejeter
                  </button>
                </div>

                {rejectId === proposal.id && (
                  <div className="mt-4 space-y-3">
                    <label htmlFor={`reason-${proposal.id}`}
                      className="block text-sm font-medium">
                      Motif du rejet
                    </label>
                    <textarea
                      id={`reason-${proposal.id}`}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      maxLength={1000}
                      rows={3}
                      className="w-full rounded-lg border border-gray-300
                        bg-transparent dark:border-gray-700 p-3"
                      placeholder="Expliquez pourquoi cette alerte est rejetée."
                    />
                    <button
                      type="button"
                      onClick={() => void rejectProposal()}
                      disabled={busy || !reason.trim()}
                      className="rounded-lg bg-red-700 px-4 py-2
                        text-white disabled:opacity-50"
                    >
                      Confirmer le rejet
                    </button>
                  </div>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
