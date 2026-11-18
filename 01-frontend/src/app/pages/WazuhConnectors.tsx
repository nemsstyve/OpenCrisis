import { useState } from "react";
import { useMutation, useQuery } from "@apollo/client";
import {
  AlertTriangle,
  KeyRound,
  Plus,
  RefreshCw,
  ShieldX,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { useAppStore } from "../../store/useAppStore";
import {
  ADMIN_WAZUH_CONNECTORS_QUERY,
  ADMIN_CREATE_WAZUH_CONNECTOR_MUTATION,
  ADMIN_ROTATE_WAZUH_CONNECTOR_MUTATION,
  ADMIN_REVOKE_WAZUH_CONNECTOR_MUTATION,
} from "../../graphql/wazuhConnector";

interface WazuhConnector {
  id: string;
  name: string;
  sourceId: string;
  isActive: boolean;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ConnectorsData {
  adminWazuhConnectors: WazuhConnector[];
}

interface Credential {
  connectorId: string;
  sourceId: string;
  secret: string;
}

interface CreateResult {
  adminCreateWazuhConnector: Credential;
}

interface RotateResult {
  adminRotateWazuhConnectorSecret: Credential;
}

interface RevokeResult {
  adminRevokeWazuhConnector: {
    connectorId: string;
    revoked: boolean;
  };
}

function displayDate(value: string | null) {
  if (!value) return "Jamais";

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

export default function WazuhConnectors() {
  const hasPermission = useAppStore((state) => state.hasPermission);

  const canRead = hasPermission("ADMIN", "READ");
  const canWrite = hasPermission("ADMIN", "WRITE");

  const [name, setName] = useState("");
  const [sourceId, setSourceId] = useState("");

  // Secret conservé uniquement dans la mémoire du composant.
  // Ne jamais l'enregistrer dans Apollo Cache ou le stockage navigateur.
  const [credential, setCredential] = useState<Credential | null>(null);

  const { data, loading, error, refetch } =
    useQuery<ConnectorsData>(ADMIN_WAZUH_CONNECTORS_QUERY, {
      variables: { limit: 50 },
      skip: !canRead,
      fetchPolicy: "network-only",
      notifyOnNetworkStatusChange: true,
    });

  const [createConnector, { loading: creating }] =
    useMutation<CreateResult>(
      ADMIN_CREATE_WAZUH_CONNECTOR_MUTATION,
      { fetchPolicy: "no-cache" }
    );

  const [rotateSecret, { loading: rotating }] =
    useMutation<RotateResult>(
      ADMIN_ROTATE_WAZUH_CONNECTOR_MUTATION,
      { fetchPolicy: "no-cache" }
    );

  const [revokeConnector, { loading: revoking }] =
    useMutation<RevokeResult>(
      ADMIN_REVOKE_WAZUH_CONNECTOR_MUTATION,
      { fetchPolicy: "no-cache" }
    );

  const busy = creating || rotating || revoking;

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite || busy || credential) return;

    const cleanName = name.trim();
    const cleanSource = sourceId.trim();

    if (!cleanName || !cleanSource) {
      toast.error("Le nom et l'identifiant source sont obligatoires.");
      return;
    }

    try {
      const result = await createConnector({
        variables: {
          input: {
            name: cleanName,
            sourceId: cleanSource,
          },
        },
      });

      const issued = result.data?.adminCreateWazuhConnector;

      if (!issued?.connectorId || !issued.secret) {
        throw new Error("Identifiants absents de la réponse.");
      }

      setCredential(issued);
      setName("");
      setSourceId("");
      toast.success("Connecteur créé. Enregistrez son secret.");
      void refetch().catch(() => {
        toast.error("Impossible d'actualiser la liste.");
      });
    } catch (mutationError) {
      toast.error(errorMessage(mutationError));
    }
  }

  async function handleRotate(connector: WazuhConnector) {
    if (!canWrite || busy || credential || !connector.isActive) return;

    const confirmed = window.confirm(
      `Renouveler le secret de "${connector.name}" ? ` +
      "L'ancien secret cessera de fonctionner."
    );

    if (!confirmed) return;

    try {
      const result = await rotateSecret({
        variables: { id: connector.id },
      });

      const issued = result.data?.adminRotateWazuhConnectorSecret;

      if (!issued?.connectorId || !issued.secret) {
        throw new Error("Nouveau secret absent de la réponse.");
      }

      setCredential(issued);
      toast.success("Secret renouvelé. Enregistrez-le maintenant.");
      void refetch().catch(() => {
        toast.error("Impossible d'actualiser la liste.");
      });
    } catch (mutationError) {
      toast.error(errorMessage(mutationError));
    }
  }

  async function handleRevoke(connector: WazuhConnector) {
    if (!canWrite || busy || credential || !connector.isActive) return;

    const confirmed = window.confirm(
      `Révoquer définitivement le connecteur "${connector.name}" ? ` +
      "Ses futures alertes ne seront plus acceptées."
    );

    if (!confirmed) return;

    try {
      const result = await revokeConnector({
        variables: { id: connector.id },
      });

      const revoked = result.data?.adminRevokeWazuhConnector;

      if (
        revoked?.connectorId !== connector.id ||
        revoked.revoked !== true
      ) {
        throw new Error("Révocation non confirmée par le serveur.");
      }

      toast.success("Connecteur révoqué.");
      await refetch();
    } catch (mutationError) {
      toast.error(errorMessage(mutationError));
    }
  }

  if (!canRead) {
    return (
      <div className="p-8 text-red-600" role="alert">
        Accès refusé : permission ADMIN/READ requise.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            Connecteurs Wazuh
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Gérez les sources d'alertes de votre entreprise.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void refetch()}
          disabled={loading || busy || !!credential}
          className="inline-flex items-center gap-2 rounded-lg border
            border-gray-300 dark:border-gray-700 px-4 py-2
            disabled:opacity-50"
        >
          <RefreshCw size={16} />
          Actualiser
        </button>
      </header>

      {credential && (
        <section
          aria-label="Secret du connecteur"
          className="rounded-xl border-2 border-amber-500 p-5 space-y-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 font-semibold">
              <KeyRound size={20} />
              Secret à enregistrer maintenant
            </div>
            <button
              type="button"
              onClick={() => setCredential(null)}
              aria-label="Masquer définitivement le secret affiché"
              className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <X size={18} />
            </button>
          </div>

          <p className="text-sm">
            Ce secret est communiqué une seule fois par le serveur.
            Conservez-le dans un gestionnaire de secrets sécurisé.
            Après fermeture, vous devrez le renouveler pour en
            obtenir un nouveau.
          </p>

          <dl className="space-y-3 text-sm">
            <div>
              <dt className="font-medium">Identifiant du connecteur</dt>
              <dd className="font-mono break-all">
                {credential.connectorId}
              </dd>
            </div>
            <div>
              <dt className="font-medium">Identifiant de source</dt>
              <dd className="font-mono break-all">
                {credential.sourceId}
              </dd>
            </div>
            <div>
              <dt className="font-medium">Secret</dt>
              <dd>
                <code className="block rounded-lg bg-gray-100
                  dark:bg-gray-950 p-3 break-all select-all">
                  {credential.secret}
                </code>
              </dd>
            </div>
          </dl>

          <button
            type="button"
            onClick={() => setCredential(null)}
            className="rounded-lg bg-amber-700 px-4 py-2 text-white"
          >
            J'ai enregistré le secret — Fermer
          </button>
        </section>
      )}

      {canWrite && (
        <section className="rounded-xl border border-gray-200
          dark:border-gray-700 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Plus size={20} />
            <h2 className="text-lg font-semibold">
              Nouveau connecteur
            </h2>
          </div>

          <form onSubmit={(event) => void handleCreate(event)}
            className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="wazuh-name"
                className="block text-sm font-medium mb-2">
                Nom du connecteur
              </label>
              <input
                id="wazuh-name"
                type="text"
                required
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Wazuh SOC principal"
                className="w-full rounded-lg border border-gray-300
                  bg-transparent dark:border-gray-700 px-3 py-2"
              />
            </div>

            <div>
              <label htmlFor="wazuh-source"
                className="block text-sm font-medium mb-2">
                Identifiant de source
              </label>
              <input
                id="wazuh-source"
                type="text"
                required
                maxLength={120}
                value={sourceId}
                onChange={(event) => setSourceId(event.target.value)}
                placeholder="wazuh-soc-principal"
                className="w-full rounded-lg border border-gray-300
                  bg-transparent dark:border-gray-700 px-3 py-2"
              />
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={busy || !!credential}
                className="rounded-lg bg-blue-700 px-4 py-2 text-white
                  hover:bg-blue-800 disabled:opacity-50"
              >
                {creating ? "Création en cours…" : "Créer le connecteur"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="space-y-4" aria-label="Connecteurs existants">
        <h2 className="text-lg font-semibold">
          Connecteurs enregistrés
        </h2>

        {loading && (
          <p role="status" className="text-sm text-gray-500">
            Chargement des connecteurs…
          </p>
        )}

        {error && (
          <div role="alert"
            className="rounded-lg border border-red-500/30 p-4">
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle size={18} />
              Impossible de charger les connecteurs.
            </div>
            <p className="mt-2 text-sm">{error.message}</p>
          </div>
        )}

        {!loading && !error &&
          data?.adminWazuhConnectors.length === 0 && (
            <p className="rounded-lg border border-gray-200
              dark:border-gray-700 p-6 text-gray-500">
              Aucun connecteur enregistré.
            </p>
          )}

        <div className="grid gap-4">
          {data?.adminWazuhConnectors.map((connector) => (
            <article
              key={connector.id}
              className="rounded-xl border border-gray-200
                dark:border-gray-700 p-5"
            >
              <div className="flex flex-wrap justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold break-words">
                    {connector.name}
                  </h3>
                  <p className="mt-1 text-sm font-mono text-gray-500 break-all">
                    {connector.sourceId}
                  </p>
                </div>

                <span className={
                  connector.isActive
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400"
                }>
                  {connector.isActive ? "Actif" : "Révoqué"}
                </span>
              </div>

              <dl className="mt-4 grid gap-3 text-sm
                sm:grid-cols-2 text-gray-500">
                <div>
                  <dt className="font-medium">Création</dt>
                  <dd>{displayDate(connector.createdAt)}</dd>
                </div>
                <div>
                  <dt className="font-medium">Dernière utilisation</dt>
                  <dd>{displayDate(connector.lastUsedAt)}</dd>
                </div>
                {!connector.isActive && (
                  <div>
                    <dt className="font-medium">Révocation</dt>
                    <dd>{displayDate(connector.revokedAt)}</dd>
                  </div>
                )}
              </dl>

              {canWrite && connector.isActive && (
                <div className="mt-5 flex flex-wrap gap-3 border-t
                  border-gray-200 dark:border-gray-700 pt-4">
                  <button
                    type="button"
                    disabled={busy || !!credential}
                    onClick={() => void handleRotate(connector)}
                    className="inline-flex items-center gap-2 rounded-lg
                      border border-amber-500/50 px-4 py-2
                      disabled:opacity-50"
                  >
                    <KeyRound size={16} />
                    Renouveler le secret
                  </button>

                  <button
                    type="button"
                    disabled={busy || !!credential}
                    onClick={() => void handleRevoke(connector)}
                    className="inline-flex items-center gap-2 rounded-lg
                      border border-red-500/50 px-4 py-2 text-red-600
                      disabled:opacity-50"
                  >
                    <ShieldX size={16} />
                    Révoquer
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
