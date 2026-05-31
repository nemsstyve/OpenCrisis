import { useState } from "react";
import type { ChangeEvent, ComponentType, FormEvent } from "react";
import {
  Users, Shield, ScrollText, Plus, Pencil, Trash2,
  Loader2, X, Key, Check, ChevronLeft, ChevronRight,
} from "lucide-react";
import { useQuery, useMutation } from "@apollo/client";
import {
  ADMIN_USERS_QUERY, ADMIN_ROLES_QUERY, ADMIN_PERMISSIONS_QUERY, ADMIN_AUDIT_LOGS_QUERY,
  ADMIN_CREATE_USER_MUTATION, ADMIN_UPDATE_USER_MUTATION, ADMIN_DELETE_USER_MUTATION,
  ADMIN_ASSIGN_ROLE_MUTATION, ADMIN_REMOVE_ROLE_MUTATION, ADMIN_RESET_PASSWORD_MUTATION,
  ADMIN_CREATE_ROLE_MUTATION, ADMIN_DELETE_ROLE_MUTATION, ADMIN_UPDATE_ROLE_PERMISSIONS_MUTATION,
} from "../../graphql/admin";
import { useAppStore } from "../../store/useAppStore";
import type {
  GqlAdminUser, GqlRoleDetail, GqlAdminPermission, GqlAuditLogPage, GqlAuditLogEntry,
} from "../../types/api";

type Tab = "users" | "roles" | "audit";

// ── Helpers ───────────────────────────────────────────────────────────────────

const RESOURCE_LABELS: Record<string, string> = {
  DASHBOARD: "Dashboard", MAIN_COURANTE_DIR: "MC Direction",
  MAIN_COURANTE_OPS: "MC Opérationnel", TIMELINE: "Timeline",
  DOCUMENTS: "Documents", BIBLIOTHEQUE: "Bibliothèque",
  ANNUAIRE: "Annuaire", CARTOGRAPHIE: "Cartographie", ADMIN: "Administration",
};

const inputCls =
  "w-full bg-[#0a0b0d] border border-[#1e2229] rounded-md px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors";

function gqlError(err: unknown): string {
  return (err as { graphQLErrors?: Array<{ message: string }> })?.graphQLErrors?.[0]?.message
    ?? (err instanceof Error ? err.message : "Une erreur est survenue");
}

// ── Modal utilisateur ─────────────────────────────────────────────────────────

interface UserModalProps {
  user?: GqlAdminUser | null;
  roles: GqlRoleDetail[];
  onClose: () => void;
  onSuccess: () => void;
}

function UserModal({ user, roles, onClose, onSuccess }: UserModalProps) {
  const [form, setForm] = useState({
    email: user?.email ?? "",
    password: "",
    firstName: user?.firstName ?? "",
    lastName: user?.lastName ?? "",
    phone: user?.phone ?? "",
    company: user?.company ?? "",
    site: user?.site ?? "",
    isActive: user?.isActive ?? true,
  });
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>(
    user?.roles.map((r) => r.id) ?? []
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createUser] = useMutation(ADMIN_CREATE_USER_MUTATION, {
    refetchQueries: [{ query: ADMIN_USERS_QUERY }],
  });
  const [updateUser] = useMutation(ADMIN_UPDATE_USER_MUTATION);
  const [assignRole] = useMutation(ADMIN_ASSIGN_ROLE_MUTATION);
  const [removeRole] = useMutation(ADMIN_REMOVE_ROLE_MUTATION);

  function field(key: keyof typeof form) {
    return {
      value: String(form[key]),
      onChange: (e: ChangeEvent<HTMLInputElement>) =>
        setForm((p) => ({ ...p, [key]: e.target.value })),
    };
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (user) {
        // Update user
        await updateUser({
          variables: {
            id: user.id,
            input: {
              firstName: form.firstName, lastName: form.lastName,
              phone: form.phone || null, company: form.company || null,
              site: form.site || null, isActive: form.isActive,
            },
          },
        });
        // Sync roles: assign new ones, remove old ones
        const currentIds = new Set(user.roles.map((r) => r.id));
        const newIds = new Set(selectedRoleIds);
        for (const id of selectedRoleIds) {
          if (!currentIds.has(id)) await assignRole({ variables: { userId: user.id, roleId: id } });
        }
        for (const id of currentIds) {
          if (!newIds.has(id)) await removeRole({ variables: { userId: user.id, roleId: id } });
        }
      } else {
        // Create user
        if (!form.password) { setError("Le mot de passe est requis"); setSubmitting(false); return; }
        await createUser({
          variables: {
            input: {
              email: form.email, password: form.password,
              firstName: form.firstName, lastName: form.lastName,
              phone: form.phone || null, company: form.company || null,
              site: form.site || null,
            },
            roleIds: selectedRoleIds.length > 0 ? selectedRoleIds : null,
          },
        });
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(gqlError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-[#13151a] border border-[#1e2229] rounded-lg w-full max-w-lg max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e2229]">
          <h2 className="text-white font-medium">{user ? "Modifier l'utilisateur" : "Créer un utilisateur"}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Prénom *</label>
              <input {...field("firstName")} required className={inputCls} />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Nom *</label>
              <input {...field("lastName")} required className={inputCls} />
            </div>
          </div>
          {!user && (
            <>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Email *</label>
                <input {...field("email")} type="email" required className={inputCls} />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Mot de passe *</label>
                <input {...field("password")} type="password" required className={inputCls} placeholder="Min. 8 caractères" />
              </div>
            </>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Téléphone</label>
              <input {...field("phone")} type="tel" className={inputCls} />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Entreprise</label>
              <input {...field("company")} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Site</label>
            <input {...field("site")} className={inputCls} />
          </div>

          {user && (
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
                className="w-4 h-4 accent-blue-600"
              />
              <span className="text-sm text-gray-300">Compte actif</span>
            </label>
          )}

          {/* Rôles */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Rôles</label>
            <div className="flex flex-wrap gap-2">
              {roles.map((role) => {
                const selected = selectedRoleIds.includes(role.id);
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => setSelectedRoleIds((prev) =>
                      prev.includes(role.id) ? prev.filter((id) => id !== role.id) : [...prev, role.id]
                    )}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors border ${
                      selected
                        ? "bg-blue-600/20 text-blue-400 border-blue-600/40"
                        : "bg-[#0a0b0d] text-gray-400 border-[#1e2229] hover:border-gray-500"
                    }`}
                  >
                    {selected && <Check className="w-3 h-3 inline mr-1" />}
                    {role.name}
                  </button>
                );
              })}
            </div>
          </div>

          {error && <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded px-3 py-2">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 border border-[#1e2229] text-gray-400 hover:text-white rounded-md px-3 py-2 text-sm transition-colors">Annuler</button>
            <button type="submit" disabled={submitting} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded-md px-3 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-2">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? "Enregistrement…" : user ? "Modifier" : "Créer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Tab Utilisateurs ──────────────────────────────────────────────────────────

function UsersTab() {
  const currentUser = useAppStore((s) => s.currentUser);
  const [modal, setModal] = useState<{ open: boolean; user?: GqlAdminUser | null }>({ open: false });
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPwd, setResetPwd] = useState("");
  const [resetSubmitting, setResetSubmitting] = useState(false);

  const { data, loading, error } = useQuery<{ adminUsers: GqlAdminUser[] }>(ADMIN_USERS_QUERY, {
    fetchPolicy: "cache-and-network",
  });
  const { data: rolesData } = useQuery<{ adminRoles: GqlRoleDetail[] }>(ADMIN_ROLES_QUERY);

  const [deleteUser] = useMutation<{ adminDeleteUser: boolean }, { id: string }>(
    ADMIN_DELETE_USER_MUTATION,
    {
      update(cache, _, { variables }) {
        if (!variables?.id) return;
        cache.updateQuery({ query: ADMIN_USERS_QUERY }, (prev) => {
          if (!prev) return prev;
          return { adminUsers: prev.adminUsers.filter((u: GqlAdminUser) => u.id !== variables.id) };
        });
      },
    }
  );
  const [resetPassword] = useMutation(ADMIN_RESET_PASSWORD_MUTATION);

  async function handleDelete(user: GqlAdminUser) {
    if (!confirm(`Supprimer ${user.firstName} ${user.lastName} ?`)) return;
    await deleteUser({ variables: { id: user.id } });
  }

  async function handleResetPwd() {
    if (!resetUserId || !resetPwd) return;
    setResetSubmitting(true);
    try {
      await resetPassword({ variables: { userId: resetUserId, newPassword: resetPwd } });
      setResetUserId(null);
      setResetPwd("");
    } finally {
      setResetSubmitting(false);
    }
  }

  const users = data?.adminUsers ?? [];
  const roles = rolesData?.adminRoles ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-gray-400 text-sm">{users.length} utilisateur{users.length > 1 ? "s" : ""}</p>
        <button
          onClick={() => setModal({ open: true, user: null })}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm transition-colors"
        >
          <Plus className="w-4 h-4" />Ajouter
        </button>
      </div>

      {loading && !data && <div className="flex items-center gap-2 text-gray-500 py-8 justify-center"><Loader2 className="w-4 h-4 animate-spin" /><span className="text-sm">Chargement…</span></div>}
      {error && <p className="text-red-400 text-sm">{error.message}</p>}

      <div className="bg-[#13151a] border border-[#1e2229] rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-[#0a0b0d] border-b border-[#1e2229]">
            <tr>
              {["Nom", "Email", "Rôles", "Statut", "Actions"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs text-gray-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e2229]">
            {users.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500 text-sm">Aucun utilisateur</td></tr>
            )}
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-[#1a1d24] transition-colors">
                <td className="px-4 py-3 text-sm text-white">{user.firstName} {user.lastName}</td>
                <td className="px-4 py-3 text-sm text-gray-400">{user.email}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {user.roles.map((r) => (
                      <span key={r.id} className="px-2 py-0.5 bg-blue-600/15 text-blue-400 text-xs rounded border border-blue-600/30">{r.name}</span>
                    ))}
                    {user.roles.length === 0 && <span className="text-gray-600 text-xs">Aucun rôle</span>}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 text-xs rounded ${user.isActive ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                    {user.isActive ? "Actif" : "Inactif"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button onClick={() => setModal({ open: true, user })} className="p-1 hover:bg-[#2a2e39] rounded text-gray-500 hover:text-white" title="Modifier"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setResetUserId(user.id)} className="p-1 hover:bg-[#2a2e39] rounded text-gray-500 hover:text-yellow-400" title="Réinitialiser le mot de passe"><Key className="w-3.5 h-3.5" /></button>
                    {user.id !== currentUser?.id && (
                      <button onClick={() => handleDelete(user)} className="p-1 hover:bg-red-500/10 rounded text-gray-500 hover:text-red-400" title="Supprimer"><Trash2 className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Inline reset password form */}
      {resetUserId && (
        <div className="mt-4 bg-[#13151a] border border-yellow-500/30 rounded-lg p-4 flex items-center gap-3">
          <Key className="w-4 h-4 text-yellow-400 flex-shrink-0" />
          <input
            type="password"
            value={resetPwd}
            onChange={(e) => setResetPwd(e.target.value)}
            placeholder="Nouveau mot de passe…"
            className="flex-1 bg-[#0a0b0d] border border-[#1e2229] rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-yellow-500"
          />
          <button onClick={handleResetPwd} disabled={!resetPwd || resetSubmitting} className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 text-white text-sm rounded disabled:opacity-50">
            {resetSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Valider"}
          </button>
          <button onClick={() => { setResetUserId(null); setResetPwd(""); }} className="p-1 text-gray-500 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
      )}

      {modal.open && (
        <UserModal
          user={modal.user}
          roles={roles}
          onClose={() => setModal({ open: false })}
          onSuccess={() => {}}
        />
      )}
    </div>
  );
}

// ── Tab Rôles & Permissions ───────────────────────────────────────────────────

function RolesTab() {
  const [editingRole, setEditingRole] = useState<GqlRoleDetail | null>(null);
  const [editPerms, setEditPerms] = useState<Set<string>>(new Set());
  const [showCreateRole, setShowCreateRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: rolesData, loading: rolesLoading } = useQuery<{ adminRoles: GqlRoleDetail[] }>(ADMIN_ROLES_QUERY, {
    fetchPolicy: "cache-and-network",
  });
  const { data: permsData } = useQuery<{ adminPermissions: GqlAdminPermission[] }>(ADMIN_PERMISSIONS_QUERY);

  const [deleteRole] = useMutation<{ adminDeleteRole: boolean }, { id: string }>(ADMIN_DELETE_ROLE_MUTATION, {
    update(cache, _, { variables }) {
      if (!variables?.id) return;
      cache.updateQuery({ query: ADMIN_ROLES_QUERY }, (prev) => {
        if (!prev) return prev;
        return { adminRoles: prev.adminRoles.filter((r: GqlRoleDetail) => r.id !== variables.id) };
      });
    },
  });
  const [createRole] = useMutation(ADMIN_CREATE_ROLE_MUTATION, {
    refetchQueries: [{ query: ADMIN_ROLES_QUERY }],
  });
  const [updateRolePerms] = useMutation(ADMIN_UPDATE_ROLE_PERMISSIONS_MUTATION);

  const roles = rolesData?.adminRoles ?? [];
  const allPerms = permsData?.adminPermissions ?? [];

  // Group permissions by resource for the permission matrix
  const byResource = allPerms.reduce<Record<string, GqlAdminPermission[]>>((acc, p) => {
    (acc[p.resource] ??= []).push(p);
    return acc;
  }, {});

  function startEdit(role: GqlRoleDetail) {
    setEditingRole(role);
    setEditPerms(new Set(role.permissions.map((p) => p.id)));
  }

  async function savePerms() {
    if (!editingRole) return;
    setSaving(true);
    try {
      await updateRolePerms({ variables: { roleId: editingRole.id, permissionIds: Array.from(editPerms) } });
      setEditingRole(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateRole(e: FormEvent) {
    e.preventDefault();
    if (!newRoleName.trim()) return;
    setSaving(true);
    try {
      await createRole({
        variables: { input: { name: newRoleName.trim(), description: newRoleDesc || null, permissionIds: [] } },
      });
      setShowCreateRole(false);
      setNewRoleName(""); setNewRoleDesc("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-gray-400 text-sm">{roles.length} rôle{roles.length > 1 ? "s" : ""}</p>
        <button onClick={() => setShowCreateRole(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm transition-colors">
          <Plus className="w-4 h-4" />Créer un rôle
        </button>
      </div>

      {/* Create role form */}
      {showCreateRole && (
        <form onSubmit={handleCreateRole} className="mb-6 bg-[#13151a] border border-blue-500/30 rounded-lg p-4 space-y-3">
          <h3 className="text-white text-sm font-medium">Nouveau rôle</h3>
          <input value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} required placeholder="Nom du rôle *" className={inputCls} />
          <input value={newRoleDesc} onChange={(e) => setNewRoleDesc(e.target.value)} placeholder="Description (optionnelle)" className={inputCls} />
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Créer"}
            </button>
            <button type="button" onClick={() => setShowCreateRole(false)} className="px-3 py-1.5 border border-[#1e2229] text-gray-400 hover:text-white text-sm rounded">Annuler</button>
          </div>
        </form>
      )}

      {rolesLoading && !rolesData && <div className="flex items-center gap-2 text-gray-500 py-8 justify-center"><Loader2 className="w-4 h-4 animate-spin" /><span className="text-sm">Chargement…</span></div>}

      <div className="space-y-3">
        {roles.map((role) => (
          <div key={role.id} className="bg-[#13151a] border border-[#1e2229] rounded-lg p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-white font-medium">{role.name}</h3>
                  {role.isSystem && <span className="px-1.5 py-0.5 bg-gray-700 text-gray-400 text-xs rounded">Système</span>}
                </div>
                {role.description && <p className="text-gray-500 text-xs mt-0.5">{role.description}</p>}
              </div>
              {!role.isSystem && (
                <div className="flex gap-1">
                  <button onClick={() => startEdit(role)} className="p-1 hover:bg-[#2a2e39] rounded text-gray-500 hover:text-white" title="Éditer les permissions"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => confirm(`Supprimer le rôle "${role.name}" ?`) && deleteRole({ variables: { id: role.id } })} className="p-1 hover:bg-red-500/10 rounded text-gray-500 hover:text-red-400" title="Supprimer"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              )}
            </div>

            {/* Permissions editor or read-only view */}
            {editingRole?.id === role.id ? (
              <div>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
                  {Object.entries(byResource).map(([resource, perms]) => (
                    <div key={resource} className="bg-[#0a0b0d] border border-[#1e2229] rounded p-2">
                      <p className="text-xs text-gray-400 mb-1.5">{RESOURCE_LABELS[resource] ?? resource}</p>
                      {perms.map((p) => (
                        <label key={p.id} className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editPerms.has(p.id)}
                            onChange={(e) => {
                              const next = new Set(editPerms);
                              e.target.checked ? next.add(p.id) : next.delete(p.id);
                              setEditPerms(next);
                            }}
                            className="w-3 h-3 accent-blue-600"
                          />
                          <span className="text-xs text-gray-400">{p.action}</span>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={savePerms} disabled={saving} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded disabled:opacity-50 flex items-center gap-1.5">
                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    Sauvegarder
                  </button>
                  <button onClick={() => setEditingRole(null)} className="px-3 py-1.5 border border-[#1e2229] text-gray-400 hover:text-white text-sm rounded">Annuler</button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {role.permissions.length === 0
                  ? <span className="text-gray-600 text-xs">Aucune permission</span>
                  : role.permissions.map((p) => (
                    <span key={p.id} className="px-2 py-0.5 bg-[#1e2229] text-gray-300 text-xs rounded">
                      {RESOURCE_LABELS[p.resource] ?? p.resource}:{p.action}
                    </span>
                  ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab Journal d'audit ───────────────────────────────────────────────────────

const AUDIT_PAGE_SIZE = 25;

function AuditTab() {
  const [page, setPage] = useState(0);

  const { data, loading, error } = useQuery<{ adminAuditLogs: GqlAuditLogPage }>(ADMIN_AUDIT_LOGS_QUERY, {
    variables: { limit: AUDIT_PAGE_SIZE, offset: page * AUDIT_PAGE_SIZE },
    fetchPolicy: "cache-and-network",
  });

  const { items = [], total = 0 } = data?.adminAuditLogs ?? {};
  const totalPages = Math.ceil(total / AUDIT_PAGE_SIZE);

  const ACTION_COLORS: Record<string, string> = {
    CREATE: "bg-green-500/10 text-green-400",
    UPDATE: "bg-blue-500/10 text-blue-400",
    DELETE: "bg-red-500/10 text-red-400",
    LOGIN: "bg-purple-500/10 text-purple-400",
    LOGOUT: "bg-gray-500/10 text-gray-400",
    UPLOAD: "bg-yellow-500/10 text-yellow-400",
    TAG_ADD: "bg-orange-500/10 text-orange-400",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-gray-400 text-sm">{total.toLocaleString("fr-FR")} entrée{total > 1 ? "s" : ""} au total</p>
        <p className="text-xs text-gray-500">Page {page + 1}/{Math.max(totalPages, 1)}</p>
      </div>

      {loading && !data && <div className="flex items-center gap-2 text-gray-500 py-8 justify-center"><Loader2 className="w-4 h-4 animate-spin" /><span>Chargement…</span></div>}
      {error && <p className="text-red-400 text-sm">{error.message}</p>}

      <div className="bg-[#13151a] border border-[#1e2229] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#0a0b0d] border-b border-[#1e2229]">
              <tr>
                {["Date", "Utilisateur", "Action", "Ressource", "ID Ressource"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2229]">
              {items.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500 text-sm">Aucune entrée</td></tr>
              )}
              {(items as GqlAuditLogEntry[]).map((log) => (
                <tr key={log.id} className="hover:bg-[#1a1d24] transition-colors">
                  <td className="px-4 py-2.5 whitespace-nowrap text-xs text-gray-400">
                    {new Date(log.createdAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-gray-300">
                    {log.user ? `${log.user.firstName} ${log.user.lastName}` : <span className="text-gray-600">Système</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 text-xs rounded ${ACTION_COLORS[log.action] ?? "bg-gray-500/10 text-gray-400"}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-sm text-gray-400">{log.resource}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-600 font-mono truncate max-w-[120px]">
                    {log.resourceId ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="p-1.5 border border-[#1e2229] rounded hover:bg-[#1e2229] disabled:opacity-40 text-gray-400">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-gray-400">{page + 1} / {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="p-1.5 border border-[#1e2229] rounded hover:bg-[#1e2229] disabled:opacity-40 text-gray-400">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Page Administration ───────────────────────────────────────────────────────

export default function Administration() {
  const [activeTab, setActiveTab] = useState<Tab>("users");

  const tabs: { key: Tab; label: string; icon: ComponentType<{ className?: string }> }[] = [
    { key: "users", label: "Utilisateurs", icon: Users },
    { key: "roles", label: "Rôles & Permissions", icon: Shield },
    { key: "audit", label: "Journal d'audit", icon: ScrollText },
  ];

  return (
    <div className="p-8 bg-[#0f1116] min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl text-white mb-2">Administration</h1>
        <p className="text-gray-400">Gestion des utilisateurs, des rôles et de la traçabilité</p>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 mb-6 bg-[#13151a] border border-[#1e2229] rounded-lg p-1 w-fit">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded text-sm transition-colors ${
              activeTab === key
                ? "bg-[#1e2229] text-white"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === "users" && <UsersTab />}
      {activeTab === "roles" && <RolesTab />}
      {activeTab === "audit" && <AuditTab />}
    </div>
  );
}
