import { GraphQLError } from 'graphql';
import type { TimelineEventType } from '@prisma/client';
import { prisma } from '../prisma';
import { logAudit } from '../middleware/audit';
import { pubsub, TOPICS } from '../pubsub';
import { assertIncidentWritable } from './incident';

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
    isFirstDetection?: boolean | null;
    actorId?: string | null;
    ipAddress?: string | null;
    assetName?: string | null;
    affectedUser?: string | null;
  },
  userId: string,
  ipAddress?: string | null,
) {
  await assertIncidentWritable(incidentId); // N5 — refuser l'écriture sur un incident supprimé/clôturé
  const createOp = prisma.timelineEvent.create({
    data: {
      incidentId,
      type: input.type,
      title: input.title,
      description: input.description,
      occurredAt: new Date(input.occurredAt),
      isFirstDetection: input.isFirstDetection ?? false,
      actorId: input.actorId,
      ipAddress: input.ipAddress,
      assetName: input.assetName,
      affectedUser: input.affectedUser,
    },
    include: TIMELINE_INCLUDE,
  });
  // Un seul événement "première détection" par incident (point de départ du
  // décompte légal 72h) — bascule atomique pour éviter qu'une interruption
  // entre les deux requêtes ne laisse 0 ou 2 événements marqués.
  const event = input.isFirstDetection
    ? (
        await prisma.$transaction([
          prisma.timelineEvent.updateMany({
            where: { incidentId, isFirstDetection: true },
            data: { isFirstDetection: false },
          }),
          createOp,
        ])
      )[1]
    : await createOp;
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
    isFirstDetection?: boolean | null;
    ipAddress?: string | null;
    assetName?: string | null;
    affectedUser?: string | null;
  },
  userId: string,
  ipAddress?: string | null,
) {
  const existing = await getEvent(id); // garantit que l'événement existe et n'est pas supprimé
  await assertIncidentWritable(existing.incidentId); // F1 — refuser l'édition sur un incident clôturé
  const updateOp = prisma.timelineEvent.update({
    where: { id },
    data: {
      ...(input.type != null && { type: input.type }),
      ...(input.title != null && { title: input.title }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.occurredAt != null && { occurredAt: new Date(input.occurredAt) }),
      ...(input.isFirstDetection != null && { isFirstDetection: input.isFirstDetection }),
      ...(input.ipAddress !== undefined && { ipAddress: input.ipAddress }),
      ...(input.assetName !== undefined && { assetName: input.assetName }),
      ...(input.affectedUser !== undefined && { affectedUser: input.affectedUser }),
    },
    include: TIMELINE_INCLUDE,
  });
  const event = input.isFirstDetection
    ? (
        await prisma.$transaction([
          prisma.timelineEvent.updateMany({
            where: { incidentId: existing.incidentId, isFirstDetection: true, id: { not: id } },
            data: { isFirstDetection: false },
          }),
          updateOp,
        ])
      )[1]
    : await updateOp;
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
