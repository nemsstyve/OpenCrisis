// AUTO-GÉNÉRÉ depuis le schéma GraphQL — ne pas éditer manuellement.
// Régénérer avec : pnpm codegen  (requiert Node.js local ou Docker avec accès au backend)
// Schéma source : schema.graphql (extrait de 02-backend/src/schema/)
// Bootstrap manuel effectué le 2026-06-03, synchronisé avec le schéma Prisma.

// ── Scalaires ─────────────────────────────────────────────────────────────────
export type Maybe<T> = T | null;
export type Scalars = {
  ID: string;
  String: string;
  Boolean: boolean;
  Int: number;
  Float: number;
  DateTime: string;
  JSON: unknown;
};

// ── Enums ─────────────────────────────────────────────────────────────────────
export type GqlIncidentStatus = "ACTIVE" | "CONTAINED" | "CLOSED";
export type GqlSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type GqlCell = "DIRECTIONAL" | "OPERATIONAL" | "SHARED";
export type GqlTimelineEventType =
  | "DETECTION"
  | "ACTION"
  | "DECISION"
  | "COMMUNICATION"
  | "ESCALATION"
  | "RESOLUTION";
export type GqlDocumentCategory =
  | "ARTIFACT"
  | "FICHE_REFLEXE"
  | "RAPPORT"
  | "PROCEDURE"
  | "OTHER";

// Aliases sans préfixe pour la compatibilité avec le code existant
export type IncidentStatus = GqlIncidentStatus;
export type Severity = GqlSeverity;
export type Cell = GqlCell;
export type TimelineEventType = GqlTimelineEventType;
export type DocumentCategory = GqlDocumentCategory;

// ── Identité & Accès ──────────────────────────────────────────────────────────
export interface GqlPermission {
  resource: string;
  action: string;
}

export interface GqlRole {
  id?: string;
  name: string;
  description?: string | null;
  isSystem?: boolean;
}

export interface GqlUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  company?: string | null;
  site?: string | null;
  isActive?: boolean;
  mustChangePassword: boolean;
  createdAt?: string;
  roles: GqlRole[];
  permissions: GqlPermission[];
}

// ── Incident ──────────────────────────────────────────────────────────────────
export interface GqlIncident {
  id: string;
  name: string;
  description?: string | null;
  status: GqlIncidentStatus;
  severity: GqlSeverity;
  startedAt: string;
  resolvedAt?: string | null;
  createdBy?: { email: string };
}

// ── Tag ───────────────────────────────────────────────────────────────────────
export interface GqlTag {
  id: string;
  name: string;
  color: string;
}

// ── LogEntry ──────────────────────────────────────────────────────────────────
export interface GqlLogEntryAuthor {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface GqlLogEntry {
  id: string;
  incidentId: string;
  cell: GqlCell;
  content: string;
  author: GqlLogEntryAuthor;
  isEdited: boolean;
  editedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  tags: GqlTag[];
}

// ── TimelineEvent ─────────────────────────────────────────────────────────────
export interface GqlTimelineEvent {
  id: string;
  incidentId: string;
  type: GqlTimelineEventType;
  title: string;
  description?: string | null;
  occurredAt: string;
  actor?: { id: string; firstName: string; lastName: string } | null;
  ipAddress?: string | null;
  assetName?: string | null;
  affectedUser?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Document ──────────────────────────────────────────────────────────────────
export interface GqlDocumentUploader {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface GqlDocument {
  id: string;
  incidentId?: string | null;
  timelineEventId?: string | null;
  name: string;
  mimeType: string;
  sizeBytes: number;
  category: GqlDocumentCategory;
  uploadedBy: GqlDocumentUploader;
  createdAt: string;
}

// ── Contact ───────────────────────────────────────────────────────────────────
export interface GqlContact {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  organization?: string | null;
  phone?: string | null;
  email?: string | null;
  site?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Administration ────────────────────────────────────────────────────────────
export interface GqlAdminPermission {
  id: string;
  resource: string;
  action: string;
}

export interface GqlRoleDetail {
  id: string;
  name: string;
  description?: string | null;
  isSystem: boolean;
  permissions: GqlAdminPermission[];
}

export interface GqlAdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  company?: string | null;
  site?: string | null;
  isActive: boolean;
  createdAt: string;
  roles: { id: string; name: string; isSystem: boolean }[];
}

export interface GqlAuditLogUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface GqlAuditLogEntry {
  id: string;
  user?: GqlAuditLogUser | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  incidentId?: string | null;
  metadata?: string | null;
  ipAddress?: string | null;
  createdAt: string;
}

export interface GqlAuditLogPage {
  items: GqlAuditLogEntry[];
  total: number;
}
