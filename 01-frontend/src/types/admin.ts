// Types manuels pour les vues d'administration — PAS auto-généré.
// Ce fichier projette les types du schéma GraphQL (voir types/generated.ts)
// sur les formes exactes attendues par les sélections des requêtes
// d'administration (src/graphql/admin.ts). À maintenir à la main si ces
// requêtes changent.

export interface AdminUserRole {
  id: string;
  name: string;
  isSystem: boolean;
}

export interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  company?: string | null;
  site?: string | null;
  isActive: boolean;
  createdAt: string;
  roles: AdminUserRole[];
}
