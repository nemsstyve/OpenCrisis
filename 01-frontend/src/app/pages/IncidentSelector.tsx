import { useState } from "react";
import { useNavigate } from "react-router";
import { useQuery, useMutation } from "@apollo/client";
import { AlertTriangle, Plus, Loader2, RefreshCw } from "lucide-react";
import { INCIDENTS_QUERY, CREATE_INCIDENT_MUTATION } from "../../graphql/incident";
import { useAppStore } from "../../store/useAppStore";
import type { GqlIncident, Severity } from "../../types/generated";

const SEVERITY_COLORS: Record<Severity, string> = {
  LOW: "text-green-400 bg-green-400/10",
  MEDIUM: "text-yellow-400 bg-yellow-400/10",
  HIGH: "text-orange-400 bg-orange-400/10",
  CRITICAL: "text-red-400 bg-red-400/10",
};

const STATUS_LABELS: Record<GqlIncident["status"], string> = {
  ACTIVE: "En cours",
  CONTAINED: "Contenu",
  CLOSED: "Clos",
};

const SEVERITY_OPTIONS: Severity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export default function IncidentSelector() {
  const navigate = useNavigate();
  const setCurrentIncident = useAppStore((s) => s.setCurrentIncident);
  const currentUser = useAppStore((s) => s.currentUser);
  const hasPermission = useAppStore((s) => s.hasPermission);

  const { data, loading, error, refetch } = useQuery<{ incidents: GqlIncident[] }>(
    INCIDENTS_QUERY,
    { fetchPolicy: "cache-and-network" }
  );

  const [createIncident, { loading: creating }] = useMutation(CREATE_INCIDENT_MUTATION, {
    refetchQueries: [{ query: INCIDENTS_QUERY }],
  });

  const [statusFilter, setStatusFilter] = useState<"active" | "closed" | "all">("active");
  const [showModal, setShowModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newSeverity, setNewSeverity] = useState<Severity>("MEDIUM");
  const [createError, setCreateError] = useState<string | null>(null);

  function selectIncident(incident: GqlIncident) {
    setCurrentIncident(incident);
    navigate(`/incidents/${incident.id}/dashboard`);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    try {
      const { data: d } = await createIncident({
        variables: { input: { name: newName, description: newDesc || null, severity: newSeverity } },
      });
      setShowModal(false);
      setNewName(""); setNewDesc(""); setNewSeverity("MEDIUM");
      if (d?.createIncident) selectIncident(d.createIncident);
    } catch (err: unknown) {
      const msg = (err as { graphQLErrors?: Array<{ message: string }> })?.graphQLErrors?.[0]?.message
        ?? "Erreur lors de la création";
      setCreateError(msg);
    }
  }

  const canCreate = hasPermission("DASHBOARD", "WRITE");

  const visibleIncidents = (data?.incidents ?? []).filter((incident) => {
    if (statusFilter === "active") return incident.status !== "CLOSED";
    if (statusFilter === "closed") return incident.status === "CLOSED";
    return true;
  });

  const FILTERS: Array<{ key: typeof statusFilter; label: string }> = [
    { key: "active", label: "Actifs" },
    { key: "closed", label: "Clos" },
    { key: "all", label: "Tous" },
  ];

  return (
    <div className="min-h-screen bg-[#0f1116] flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-2xl text-white font-medium">Open Crisis</h1>
            <p className="text-gray-400 mt-1">
              Bonjour{currentUser ? `, ${currentUser.firstName}` : ""} — sélectionnez un incident
            </p>
          </div>
          <button
            onClick={() => refetch()}
            className="p-2 text-gray-500 hover:text-gray-300 transition-colors"
            title="Rafraîchir"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* States */}
        {loading && !data && (
          <div className="flex items-center justify-center py-16 text-gray-500 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Chargement des incidents…</span>
          </div>
        )}

        {error && (
          <div className="bg-red-400/10 border border-red-400/20 rounded-lg p-4 text-red-400 text-sm mb-4">
            Erreur : {error.message}
          </div>
        )}

        {/* Filtre par statut */}
        {data && (
          <div className="mb-4 flex gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  statusFilter === f.key
                    ? "bg-blue-500/15 text-blue-400"
                    : "text-gray-500 hover:text-gray-300 hover:bg-[#13151a]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        {/* Incident list */}
        {data && (
          <div className="space-y-3">
            {visibleIncidents.length === 0 && (
              <p className="text-gray-500 text-sm text-center py-8">
                {statusFilter === "closed"
                  ? "Aucun incident clos."
                  : "Aucun incident en cours. Déclarez-en un."}
              </p>
            )}
            {visibleIncidents.map((incident) => (
              <button
                key={incident.id}
                onClick={() => selectIncident(incident)}
                className="w-full text-left bg-[#13151a] border border-[#1e2229] hover:border-blue-500/50 rounded-lg p-5 transition-colors group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-white font-medium group-hover:text-blue-400 transition-colors">
                        {incident.name}
                      </p>
                      {incident.description && (
                        <p className="text-gray-500 text-sm mt-0.5">{incident.description}</p>
                      )}
                      <p className="text-gray-600 text-xs mt-2">
                        Ouvert le{" "}
                        {new Date(incident.startedAt).toLocaleDateString("fr-FR", {
                          day: "numeric", month: "long", year: "numeric",
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SEVERITY_COLORS[incident.severity]}`}>
                      {incident.severity}
                    </span>
                    <span className="text-xs text-gray-500">{STATUS_LABELS[incident.status]}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Create button */}
        {canCreate && (
          <button
            onClick={() => setShowModal(true)}
            className="mt-4 w-full flex items-center justify-center gap-2 border border-dashed border-[#1e2229] hover:border-blue-500/50 rounded-lg p-4 text-gray-500 hover:text-blue-400 transition-colors text-sm"
          >
            <Plus className="w-4 h-4" />
            Déclarer un nouvel incident
          </button>
        )}
      </div>

      {/* Create incident modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-[#13151a] border border-[#1e2229] rounded-lg p-6 w-full max-w-md">
            <h2 className="text-white font-medium mb-4">Déclarer un incident</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Nom *</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  placeholder="Ex : Ransomware infrastructure prod"
                  className="w-full bg-[#0a0b0d] border border-[#1e2229] rounded-md px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Description</label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  rows={2}
                  placeholder="Description courte de l'incident"
                  className="w-full bg-[#0a0b0d] border border-[#1e2229] rounded-md px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Sévérité</label>
                <select
                  value={newSeverity}
                  onChange={(e) => setNewSeverity(e.target.value as Severity)}
                  className="w-full bg-[#0a0b0d] border border-[#1e2229] rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                >
                  {SEVERITY_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {createError && (
                <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2">
                  {createError}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setCreateError(null); }}
                  className="flex-1 border border-[#1e2229] text-gray-400 hover:text-white rounded-md px-3 py-2 text-sm transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded-md px-3 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                  {creating ? "Création…" : "Créer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
