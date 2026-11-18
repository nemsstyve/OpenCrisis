import { GraphQLError } from 'graphql';
import type { Cell } from '@prisma/client';
import { prisma } from '../prisma';
import { logAudit } from '../middleware/audit';
import { pubsub, TOPICS } from '../pubsub';
import { assertIncidentWritable } from './incident';
import { requireTenantId } from '../middleware/tenant';

const LOG_ENTRY_INCLUDE = {
  author: true,
  tags: { include: { tag: true } },
} as const;

async function getEntry(id: string) {
  const entry = await prisma.logEntry.findFirst({ where: { id, deletedAt: null }, include: LOG_ENTRY_INCLUDE });
  if (!entry) throw new GraphQLError('Entrée introuvable', { extensions: { code: 'NOT_FOUND' } });
  return entry;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getLogEntries(incidentId: string, cells?: Cell[] | null) {
  return prisma.logEntry.findMany({
    where: {
      incidentId,
      ...(cells && cells.length > 0 ? { cell: { in: cells } } : {}),
      deletedAt: null,
    },
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
  await assertIncidentWritable(incidentId, authorId); // N5 — refuser l'écriture sur un incident supprimé/clôturé
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
  const existing = await prisma.logEntry.findFirst({ where: { id, deletedAt: null }, select: { incidentId: true } });
  if (!existing) throw new GraphQLError('Entrée introuvable', { extensions: { code: 'NOT_FOUND' } });
  await assertIncidentWritable(existing.incidentId, editedById); // F1 — refuser l'édition sur un incident clôturé
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

async function getScopedTagEntry(
  logEntryId: string,
  tagId: string,
  userId: string,
) {
  const tenantId = await requireTenantId({
    userId,
    req: null,
    res: null,
  });

  const entry = await prisma.logEntry.findFirst({
    where: {
      id: logEntryId,
      deletedAt: null,
      incident: {
        tenantId,
        deletedAt: null,
      },
    },
    select: { id: true, incidentId: true },
  });

  if (!entry) {
    throw new GraphQLError('Entrée introuvable', {
      extensions: { code: 'NOT_FOUND' },
    });
  }

  const tag = await prisma.tag.findFirst({
    where: { id: tagId, tenantId },
    select: { id: true },
  });

  if (!tag) {
    throw new GraphQLError('Tag introuvable', {
      extensions: { code: 'NOT_FOUND' },
    });
  }

  await assertIncidentWritable(entry.incidentId, userId);

  return { entry, tenantId };
}

export async function addTagToLogEntry(
  logEntryId: string,
  tagId: string,
  userId: string,
) {
  const { entry } = await getScopedTagEntry(
    logEntryId,
    tagId,
    userId,
  );

  // Le trigger LogEntryTag_tenant_guard effectue aussi
  // le controle des deux tenants dans PostgreSQL.
  await prisma.logEntryTag.upsert({
    where: { logEntryId_tagId: { logEntryId, tagId } },
    create: { logEntryId, tagId },
    update: {},
  });

  logAudit({
    userId,
    action: 'TAG_ADD',
    resource: 'MAIN_COURANTE',
    resourceId: logEntryId,
    incidentId: entry.incidentId,
  });

  return getEntry(logEntryId);
}

export async function removeTagFromLogEntry(
  logEntryId: string,
  tagId: string,
  userId: string,
) {
  const { entry, tenantId } = await getScopedTagEntry(
    logEntryId,
    tagId,
    userId,
  );

  // Protection maintenue au moment du DELETE SQL,
  // y compris si les relations ont change entre-temps.
  await prisma.logEntryTag.deleteMany({
    where: {
      logEntryId,
      tagId,
      logEntry: {
        deletedAt: null,
        incident: {
          tenantId,
          deletedAt: null,
        },
      },
      tag: {
        tenantId,
      },
    },
  });

  logAudit({
    userId,
    action: 'TAG_REMOVE',
    resource: 'MAIN_COURANTE',
    resourceId: logEntryId,
    incidentId: entry.incidentId,
  });

  return getEntry(logEntryId);
}
