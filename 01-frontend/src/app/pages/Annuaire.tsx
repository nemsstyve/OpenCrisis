import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Users, Phone, Mail, Search, Plus, Pencil, Trash2, Loader2, X } from "lucide-react";
import { useQuery, useMutation } from "@apollo/client";
import {
  CONTACTS_QUERY,
  CREATE_CONTACT_MUTATION,
  UPDATE_CONTACT_MUTATION,
  DELETE_CONTACT_MUTATION,
} from "../../graphql/contact";
import { useAppStore } from "../../store/useAppStore";
import { useCurrentIncident } from "../../hooks/useCurrentIncident";
import type { GqlContact } from "../../types/generated";

// ── Formulaire contact (création / édition) ───────────────────────────────────

interface ContactFormData {
  firstName: string;
  lastName: string;
  role: string;
  organization: string;
  phone: string;
  email: string;
  site: string;
  notes: string;
}

const EMPTY_FORM: ContactFormData = {
  firstName: "",
  lastName: "",
  role: "",
  organization: "",
  phone: "",
  email: "",
  site: "",
  notes: "",
};

interface ContactModalProps {
  initial?: GqlContact | null;
  onClose: () => void;
  onSubmit: (data: ContactFormData) => Promise<void>;
  submitting: boolean;
  error: string | null;
}

function ContactModal({ initial, onClose, onSubmit, submitting, error }: ContactModalProps) {
  const [form, setForm] = useState<ContactFormData>({
    firstName: initial?.firstName ?? "",
    lastName: initial?.lastName ?? "",
    role: initial?.role ?? "",
    organization: initial?.organization ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    site: initial?.site ?? "",
    notes: initial?.notes ?? "",
  });

  function field(key: keyof ContactFormData) {
    return {
      value: form[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm((prev) => ({ ...prev, [key]: e.target.value })),
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSubmit(form);
  }

  const inputCls =
    "w-full bg-[#0a0b0d] border border-[#1e2229] rounded-md px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors";

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-[#13151a] border border-[#1e2229] rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e2229]">
          <h2 className="text-white font-medium">
            {initial ? "Modifier le contact" : "Ajouter un contact"}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Prénom *</label>
              <input {...field("firstName")} required className={inputCls} placeholder="Jean" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Nom *</label>
              <input {...field("lastName")} required className={inputCls} placeholder="Martin" />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Rôle *</label>
            <input {...field("role")} required className={inputCls} placeholder="Chef cellule opérationnelle" />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Organisation</label>
            <input {...field("organization")} className={inputCls} placeholder="TechCorp SA" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Téléphone</label>
              <input {...field("phone")} type="tel" className={inputCls} placeholder="+33 6 12 34 56 78" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Email</label>
              <input {...field("email")} type="email" className={inputCls} placeholder="jean@company.com" />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Site / Localisation</label>
            <input {...field("site")} className={inputCls} placeholder="Paris - Siège" />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Notes</label>
            <textarea
              {...field("notes")}
              rows={3}
              className="w-full bg-[#0a0b0d] border border-[#1e2229] rounded-md px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors resize-none"
              placeholder="Informations complémentaires…"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-[#1e2229] text-gray-400 hover:text-white rounded-md px-3 py-2 text-sm transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded-md px-3 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? "Enregistrement…" : initial ? "Modifier" : "Ajouter"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page Annuaire ─────────────────────────────────────────────────────────────

export default function Annuaire() {
  useCurrentIncident();
  const hasPermission = useAppStore((s) => s.hasPermission);
  const canWrite = hasPermission("ANNUAIRE", "WRITE");

  const [searchQuery, setSearchQuery] = useState("");
  const [modal, setModal] = useState<{ open: boolean; contact?: GqlContact | null }>({ open: false });
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<GqlContact | null>(null);

  // ── Queries & mutations ───────────────────────────────────────────────────
  const { data, loading, error } = useQuery<{ contacts: GqlContact[] }>(CONTACTS_QUERY, {
    fetchPolicy: "cache-and-network",
  });

  const [createContact] = useMutation<{ createContact: GqlContact }>(CREATE_CONTACT_MUTATION, {
    update(cache, { data: result }) {
      if (!result?.createContact) return;
      cache.updateQuery({ query: CONTACTS_QUERY }, (prev) => {
        if (!prev) return { contacts: [result.createContact] };
        return { contacts: [...prev.contacts, result.createContact] };
      });
    },
  });

  const [updateContact] = useMutation(UPDATE_CONTACT_MUTATION);

  const [deleteContact] = useMutation<{ deleteContact: boolean }, { id: string }>(
    DELETE_CONTACT_MUTATION,
    {
      update(cache, _result, { variables }) {
        if (!variables?.id) return;
        cache.updateQuery({ query: CONTACTS_QUERY }, (prev) => {
          if (!prev) return prev;
          return { contacts: prev.contacts.filter((c: GqlContact) => c.id !== variables.id) };
        });
      },
    }
  );

  // ── Handlers ──────────────────────────────────────────────────────────────
  async function handleSubmit(formData: ContactFormData) {
    setModalError(null);
    setModalSubmitting(true);
    try {
      const input = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: formData.role,
        organization: formData.organization || null,
        phone: formData.phone || null,
        email: formData.email || null,
        site: formData.site || null,
        notes: formData.notes || null,
      };
      if (modal.contact) {
        await updateContact({ variables: { id: modal.contact.id, input } });
      } else {
        await createContact({ variables: { input: { ...input, isGlobal: true } } });
      }
      setModal({ open: false });
    } catch (err: unknown) {
      const msg =
        (err as { graphQLErrors?: Array<{ message: string }> })?.graphQLErrors?.[0]?.message ??
        "Une erreur est survenue";
      setModalError(msg);
    } finally {
      setModalSubmitting(false);
    }
  }

  async function handleDeleteConfirmed(contact: GqlContact) {
    setConfirmDelete(null);
    try {
      await deleteContact({ variables: { id: contact.id } });
      toast.success("Contact supprimé");
    } catch {
      toast.error("Erreur lors de la suppression");
    }
  }

  // ── Filtres ───────────────────────────────────────────────────────────────
  const contacts = data?.contacts ?? [];
  const filtered = contacts.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
      c.role.toLowerCase().includes(q) ||
      (c.organization ?? "").toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-8 bg-[#0f1116] min-h-screen">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl mb-2 text-white">Annuaire</h1>
          <p className="text-gray-400">Répertoire des membres de la cellule de crise</p>
        </div>
        {canWrite && (
          <button
            onClick={() => { setModal({ open: true, contact: null }); setModalError(null); }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            Ajouter un contact
          </button>
        )}
      </div>

      {/* Recherche */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher un contact…"
            className="w-full bg-[#13151a] border border-[#1e2229] rounded-lg pl-10 pr-4 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
      </div>

      {/* États */}
      {loading && !data && (
        <div className="flex items-center justify-center py-16 text-gray-500 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Chargement des contacts…</span>
        </div>
      )}

      {error && (
        <div className="bg-red-400/10 border border-red-400/20 rounded-lg p-4 text-red-400 text-sm mb-4">
          Erreur : {error.message}
        </div>
      )}

      {/* Tableau */}
      {data && (
        <div className="bg-[#13151a] border border-[#1e2229] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#0a0b0d] border-b border-[#1e2229]">
                <tr>
                  {["Nom", "Rôle", "Organisation", "Site", "Téléphone", "Email", ""].map((h) => (
                    <th
                      key={h}
                      className="px-6 py-4 text-left text-sm text-gray-400 uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e2229]">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      {contacts.length === 0
                        ? "Aucun contact — ajoutez-en un."
                        : "Aucun contact ne correspond à la recherche."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((contact) => (
                    <tr key={contact.id} className="hover:bg-[#1a1d24] transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-500/10 rounded-full flex items-center justify-center flex-shrink-0">
                            <Users className="w-4 h-4 text-blue-400" />
                          </div>
                          <span className="text-sm text-white">
                            {contact.firstName} {contact.lastName}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-300">{contact.role}</td>
                      <td className="px-6 py-4 text-sm text-gray-400">
                        {contact.organization ?? "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-400">{contact.site ?? "—"}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {contact.phone ? (
                          <a
                            href={`tel:${contact.phone}`}
                            className="flex items-center gap-2 text-blue-400 hover:text-blue-300"
                          >
                            <Phone className="w-4 h-4" />
                            {contact.phone}
                          </a>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {contact.email ? (
                          <a
                            href={`mailto:${contact.email}`}
                            className="flex items-center gap-2 text-blue-400 hover:text-blue-300"
                          >
                            <Mail className="w-4 h-4" />
                            {contact.email}
                          </a>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                      {canWrite && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => { setModal({ open: true, contact }); setModalError(null); }}
                              className="p-1.5 hover:bg-[#2a2e39] rounded transition-colors text-gray-500 hover:text-white"
                              title="Modifier"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setConfirmDelete(contact)}
                              className="p-1.5 hover:bg-red-500/10 rounded transition-colors text-gray-500 hover:text-red-400"
                              title="Supprimer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
                      {!canWrite && <td />}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-3 border-t border-[#1e2229] text-xs text-gray-500">
            {filtered.length} contact{filtered.length > 1 ? "s" : ""}
            {searchQuery && ` sur ${contacts.length}`}
          </div>
        </div>
      )}

      {/* Modal */}
      {modal.open && (
        <ContactModal
          initial={modal.contact}
          onClose={() => setModal({ open: false })}
          onSubmit={handleSubmit}
          submitting={modalSubmitting}
          error={modalError}
        />
      )}
      <ConfirmDialog
        open={!!confirmDelete}
        description={confirmDelete ? `Supprimer ${confirmDelete.firstName} ${confirmDelete.lastName} ?` : ""}
        onConfirm={() => confirmDelete && handleDeleteConfirmed(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
