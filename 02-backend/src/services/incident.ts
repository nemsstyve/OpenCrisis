import { GraphQLError } from 'graphql';
import type { IncidentStatus, Severity } from '@prisma/client';
import { prisma } from '../prisma';
import { logAudit } from '../middleware/audit';
import { pubsub, TOPICS } from '../pubsub';

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getIncidents() {
  const incidents = await prisma.incident.findMany({
    where: { deletedAt: null },
    orderBy: { startedAt: 'desc' },
  });
  // N7 — précharger les créateurs en une seule requête (évite le N+1 sur Incident.createdBy,
  // createdById n'ayant pas de relation Prisma).
  const creatorIds = [...new Set(incidents.map((i) => i.createdById))];
  const creators = await prisma.user.findMany({ where: { id: { in: creatorIds } } });
  const byId = new Map(creators.map((u) => [u.id, u]));
  return incidents.map((i) => ({ ...i, createdBy: byId.get(i.createdById) ?? null }));
}

export async function getIncident(id: string) {
  const incident = await prisma.incident.findFirst({ where: { id, deletedAt: null } });
  if (!incident) throw new GraphQLError('Incident introuvable', { extensions: { code: 'NOT_FOUND' } });
  return incident;
}

/**
 * N5 — un incident doit être ouvert à l'écriture (existant, non supprimé, non clôturé)
 * avant d'y créer une entrée de main courante ou un événement de timeline.
 */
export async function assertIncidentWritable(incidentId: string): Promise<void> {
  const incident = await prisma.incident.findFirst({
    where: { id: incidentId, deletedAt: null },
    select: { status: true },
  });
  if (!incident) {
    throw new GraphQLError('Incident introuvable', { extensions: { code: 'NOT_FOUND' } });
  }
  if (incident.status === 'CLOSED') {
    throw new GraphQLError('Cet incident est clôturé : aucune nouvelle entrée ne peut y être ajoutée.', {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }
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
