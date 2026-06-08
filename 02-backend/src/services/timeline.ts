import { GraphQLError } from 'graphql';
import type { TimelineEventType } from '@prisma/client';
import { prisma } from '../prisma';
import { logAudit } from '../middleware/audit';
import { pubsub, TOPICS } from '../pubsub';

const TIMELINE_INCLUDE = {
  actor: true,
} as const;

async function getEvent(id: string) {
  const event = await prisma.timelineEvent.findFirst({ where: { id, deletedAt: null }, include: TIMELINE_INCLUDE });
  if (!event) throw new GraphQLError('Événement introuvable', { extensions: { code: 'NOT_FOUND' } });
  return event;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getTimelineEvents(incidentId: string) {
  return prisma.timelineEvent.findMany({
    where: { incidentId, deletedAt: null },
    orderBy: { occurredAt: 'asc' },
    include: TIMELINE_INCLUDE,
  });
}

export async function getTimelineEvent(id: string) {
  return getEvent(id);
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createTimelineEvent(
  incidentId: string,
  input: {
    type: TimelineEventType;
    title: string;
    description?: string | null;
    occurredAt: string;
    actorId?: string | null;
    ipAddress?: string | null;
    assetName?: string | null;
    affectedUser?: string | null;
  },
  userId: string,
  ipAddress?: string | null,
) {
  const event = await prisma.timelineEvent.create({
    data: {
      incidentId,
      type: input.type,
      title: input.title,
      description: input.description,
      occurredAt: new Date(input.occurredAt),
      actorId: input.actorId,
      ipAddress: input.ipAddress,
      assetName: input.assetName,
      affectedUser: input.affectedUser,
    },
    include: TIMELINE_INCLUDE,
  });
  logAudit({ userId, action: 'CREATE', resource: 'TIMELINE', resourceId: event.id, incidentId, ipAddress });
  pubsub.publish(TOPICS.TIMELINE_EVENT_ADDED(incidentId), { timelineEventAdded: event });
  return event;
}

export async function updateTimelineEvent(
  id: string,
  input: {
    type?: TimelineEventType | null;
    title?: string | null;
    description?: string | null;
    occurredAt?: string | null;
    ipAddress?: string | null;
    assetName?: string | null;
    affectedUser?: string | null;
  },
  userId: string,
  ipAddress?: string | null,
) {
  await getEvent(id); // garantit que l'événement existe et n'est pas supprimé
  const event = await prisma.timelineEvent.update({
    where: { id },
    data: {
      ...(input.type != null && { type: input.type }),
      ...(input.title != null && { title: input.title }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.occurredAt != null && { occurredAt: new Date(input.occurredAt) }),
      ...(input.ipAddress !== undefined && { ipAddress: input.ipAddress }),
      ...(input.assetName !== undefined && { assetName: input.assetName }),
      ...(input.affectedUser !== undefined && { affectedUser: input.affectedUser }),
    },
    include: TIMELINE_INCLUDE,
  });
  logAudit({ userId, action: 'UPDATE', resource: 'TIMELINE', resourceId: id, incidentId: event.incidentId, ipAddress });
  return event;
}

export async function deleteTimelineEvent(id: string, userId: string, ipAddress?: string | null) {
  const event = await getEvent(id);
  // Soft delete : conserver la trace forensique de l'événement (Q7)
  await prisma.timelineEvent.update({ where: { id }, data: { deletedAt: new Date() } });
  logAudit({ userId, action: 'DELETE', resource: 'TIMELINE', resourceId: id, incidentId: event.incidentId, ipAddress });
  return true;
}
