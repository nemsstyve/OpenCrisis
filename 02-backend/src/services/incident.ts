import { GraphQLError } from 'graphql';
import type { IncidentStatus, Severity } from '@prisma/client';
import { prisma } from '../prisma';
import { logAudit } from '../middleware/audit';
import { pubsub, TOPICS } from '../pubsub';

// ─── Types ────────────────────────────────────────────────────────────────────

export const INCIDENT_INCLUDE = {
  _count: false,
} as const;

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getIncidents() {
  return prisma.incident.findMany({
    where: { deletedAt: null },
    orderBy: { startedAt: 'desc' },
  });
}

export async function getIncident(id: string) {
  const incident = await prisma.incident.findFirst({ where: { id, deletedAt: null } });
  if (!incident) throw new GraphQLError('Incident introuvable', { extensions: { code: 'NOT_FOUND' } });
  return incident;
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createIncident(
  input: { name: string; description?: string | null; severity?: Severity | null },
  createdById: string,
  ipAddress?: string | null,
) {
  const incident = await prisma.incident.create({
    data: {
      name: input.name,
      description: input.description,
      severity: input.severity ?? 'MEDIUM',
      createdById,
    },
  });
  logAudit({ userId: createdById, action: 'CREATE', resource: 'INCIDENT', resourceId: incident.id, ipAddress });
  pubsub.publish(TOPICS.INCIDENT_CREATED, { incidentCreated: incident });
  return incident;
}

export async function updateIncident(
  id: string,
  input: { name?: string | null; description?: string | null; status?: IncidentStatus | null; severity?: Severity | null },
  userId: string,
  ipAddress?: string | null,
) {
  const existing = await getIncident(id);

  const incident = await prisma.incident.update({
    where: { id },
    data: {
      ...(input.name != null && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.status != null && { status: input.status, resolvedAt: input.status === 'CLOSED' ? new Date() : existing.resolvedAt }),
      ...(input.severity != null && { severity: input.severity }),
    },
  });

  logAudit({ userId, action: 'UPDATE', resource: 'INCIDENT', resourceId: id, ipAddress });

  if (input.status != null && input.status !== existing.status) {
    pubsub.publish(TOPICS.INCIDENT_STATUS_CHANGED(id), { incidentStatusChanged: incident });
  }

  return incident;
}

export async function deleteIncident(id: string, userId: string, ipAddress?: string | null) {
  await getIncident(id);
  await prisma.incident.update({ where: { id }, data: { deletedAt: new Date() } });
  logAudit({ userId, action: 'DELETE', resource: 'INCIDENT', resourceId: id, ipAddress });
  return true;
}
