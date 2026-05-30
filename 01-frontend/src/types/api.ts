// Types de l'API GraphQL — maintenus à la main jusqu'au codegen
// Correspondance avec le schéma Prisma + resolvers du backend

export interface GqlPermission {
  resource: string;
  action: string;
}

export interface GqlRole {
  name: string;
}

export interface GqlUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: GqlRole[];
  permissions: GqlPermission[];
}

export type IncidentStatus = "ACTIVE" | "CONTAINED" | "CLOSED";
export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface GqlIncident {
  id: string;
  name: string;
  description?: string | null;
  status: IncidentStatus;
  severity: Severity;
  startedAt: string;
  resolvedAt?: string | null;
  createdBy?: { email: string };
}
