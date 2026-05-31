// Types de l'API GraphQL — maintenus à la main (codegen nécessite un env local Node.js)
// Correspondance exacte avec le schéma Prisma + resolvers du backend

// ── Identité & Accès ──────────────────────────────────────────────────────────
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

// ── Enums ─────────────────────────────────────────────────────────────────────
export type IncidentStatus = "ACTIVE" | "CONTAINED" | "CLOSED";
export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type Cell = "DIRECTIONAL" | "OPERATIONAL" | "SHARED";
export type TimelineEventType =
  | "DETECTION"
  | "ACTION"
  | "DECISION"
  | "COMMUNICATION"
  | "ESCALATION"
  | "RESOLUTION";
export type DocumentCategory =
  | "ARTIFACT"
  | "FICHE_REFLEXE"
  | "RAPPORT"
  | "PROCEDURE"
  | "OTHER";

// ── Incident ──────────────────────────────────────────────────────────────────
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
  cell: Cell;
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
  type: TimelineEventType;
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
  category: DocumentCategory;
  uploadedBy: GqlDocumentUploader;
  createdAt: string;
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
  isGlobal: boolean;
  createdAt: string;
  updatedAt: string;
}
