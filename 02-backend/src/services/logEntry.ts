import { GraphQLError } from 'graphql';
import type { Cell } from '@prisma/client';
import { prisma } from '../prisma';
import { logAudit } from '../middleware/audit';
import { pubsub, TOPICS } from '../pubsub';

const LOG_ENTRY_INCLUDE = {
  author: true,
  tags: { include: { tag: true } },
} as const;

function toGql(entry: Awaited<ReturnType<typeof prisma.logEntry.findFirstOrThrow>>) {
  return entry;
}

async function getEntry(id: string) {
  const entry = await prisma.logEntry.findFirst({ where: { id, deletedAt: null }, include: LOG_ENTRY_INCLUDE });
  if (!entry) throw new GraphQLError('Entrée introuvable', { extensions: { code: 'NOT_FOUND' } });
  return entry;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getLogEntries(incidentId: string, cell?: Cell | null) {
  return prisma.logEntry.findMany({
    where: { incidentId, ...(cell ? { cell } : {}), deletedAt: null },
    orderBy: { createdAt: 'asc' },
    include: LOG_ENTRY_INCLUDE,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createLogEntry(
  incidentId: string,
  cell: Cell,
  content: string,
  authorId: string,
  ipAddress?: string | null,
) {
  const entry = await prisma.logEntry.create({
    data: { incidentId, cell, content, authorId },
    include: LOG_ENTRY_INCLUDE,
  });
  logAudit({ userId: authorId, action: 'CREATE', resource: 'MAIN_COURANTE', resourceId: entry.id, incidentId, ipAddress });
  pubsub.publish(TOPICS.LOG_ENTRY_ADDED(incidentId, cell), { logEntryAdded: entry });
  return entry;
}

export async function editLogEntry(
  id: string,
  content: string,
  editedById: string,
  ipAddress?: string | null,
) {
  const entry = await prisma.logEntry.update({
    where: { id },
    data: { content, isEdited: true, editedAt: new Date(), editedById },
    include: LOG_ENTRY_INCLUDE,
  });
  logAudit({ userId: editedById, action: 'UPDATE', resource: 'MAIN_COURANTE', resourceId: id, incidentId: entry.incidentId, ipAddress });
  pubsub.publish(TOPICS.LOG_ENTRY_UPDATED(entry.incidentId, entry.cell), { logEntryUpdated: entry });
  return entry;
}

export async function deleteLogEntry(id: string, userId: string, ipAddress?: string | null) {
  const entry = await getEntry(id);
  await prisma.logEntry.update({ where: { id }, data: { deletedAt: new Date() } });
  logAudit({ userId, action: 'DELETE', resource: 'MAIN_COURANTE', resourceId: id, incidentId: entry.incidentId, ipAddress });
  return true;
}

export async function addTagToLogEntry(logEntryId: string, tagId: string, userId: string) {
  await prisma.logEntryTag.upsert({
    where: { logEntryId_tagId: { logEntryId, tagId } },
    create: { logEntryId, tagId },
    update: {},
  });
  return getEntry(logEntryId);
}

export async function removeTagFromLogEntry(logEntryId: string, tagId: string, userId: string) {
  await prisma.logEntryTag.deleteMany({ where: { logEntryId, tagId } });
  return getEntry(logEntryId);
}
