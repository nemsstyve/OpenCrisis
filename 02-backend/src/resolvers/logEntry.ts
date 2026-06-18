import { GraphQLError } from 'graphql';
import type { Cell } from '@prisma/client';
import type { GraphQLContext } from '../context';
import { requirePermission, hasPermission, requireAuth, authorizedIterator } from '../middleware/rbac';
import { validate, createLogEntrySchema } from '../utils/validation';
import { prisma } from '../prisma';
import { pubsub, TOPICS } from '../pubsub';
import {
  getLogEntries, createLogEntry, editLogEntry,
  deleteLogEntry, addTagToLogEntry, removeTagFromLogEntry,
} from '../services/logEntry';

function cellToResource(cell: Cell) {
  return cell === 'OPERATIONAL' ? 'MAIN_COURANTE_OPS' : 'MAIN_COURANTE_DIR';
}

// Cellules de main courante réellement lisibles par l'utilisateur courant.
// SHARED n'est visible que si au moins une cellule l'est.
async function readableCells(ctx: GraphQLContext): Promise<Cell[]> {
  const [canDir, canOps] = await Promise.all([
    hasPermission(ctx, 'MAIN_COURANTE_DIR', 'READ'),
    hasPermission(ctx, 'MAIN_COURANTE_OPS', 'READ'),
  ]);
  const cells: Cell[] = [];
  if (canDir) cells.push('DIRECTIONAL');
  if (canOps) cells.push('OPERATIONAL');
  if (cells.length > 0) cells.push('SHARED');
  return cells;
}

async function checkCanModifyEntry(ctx: GraphQLContext, entryId: string, userId: string) {
  const entry = await prisma.logEntry.findFirst({ where: { id: entryId, deletedAt: null } });
  if (!entry) throw new GraphQLError('Entrée introuvable', { extensions: { code: 'NOT_FOUND' } });
  const isAuthor = entry.authorId === userId;
  if (!isAuthor) {
    const canEdit = await hasPermission(ctx, cellToResource(entry.cell), 'WRITE');
    if (!canEdit) throw new GraphQLError('Permission refusée', { extensions: { code: 'FORBIDDEN' } });
  }
  return entry;
}

// Construit le `subscribe` d'une subscription main courante.
//  - avec `cell` explicite : autorise et ne diffuse que cette cellule ;
//  - sans `cell` : ne diffuse QUE les cellules réellement lisibles (readableCells),
//    ce qui empêche la fuite inter-cellules (un membre Directionnel ne doit pas
//    recevoir les entrées Opérationnelles en temps réel, et inversement).
function subscribeLogEntry(topicFn: (incidentId: string, cell: Cell) => string) {
  return async (
    _: unknown,
    { incidentId, cell }: { incidentId: string; cell?: Cell },
    ctx: GraphQLContext,
  ) => {
    if (cell) {
      const resource = cellToResource(cell);
      await requirePermission(ctx, resource, 'READ');
      return authorizedIterator(
        pubsub.asyncIterator(topicFn(incidentId, cell)),
        () => hasPermission(ctx, resource, 'READ'),
      );
    }
    const cells = await readableCells(ctx);
    if (cells.length === 0) {
      throw new GraphQLError('Permission refusée', { extensions: { code: 'FORBIDDEN' } });
    }
    return authorizedIterator(
      pubsub.asyncIterator(cells.map((c) => topicFn(incidentId, c))),
      async () => (await readableCells(ctx)).length > 0,
    );
  };
}

export const logEntryResolvers = {
  Query: {
    logEntries: async (
      _: unknown,
      { incidentId, cell }: { incidentId: string; cell?: Cell },
      ctx: GraphQLContext,
    ) => {
      // Cellule explicite : vérifier la permission sur cette seule cellule.
      if (cell) {
        await requirePermission(ctx, cellToResource(cell), 'READ');
        return getLogEntries(incidentId, [cell]);
      }
      // S3/DÉC-1 — sans cellule : ne renvoyer que les cellules réellement lisibles
      // (un membre Directionnel ne doit pas lire la main courante Opérationnelle, et inversement).
      const cells = await readableCells(ctx);
      if (cells.length === 0) {
        throw new GraphQLError('Permission refusée', { extensions: { code: 'FORBIDDEN' } });
      }
      return getLogEntries(incidentId, cells);
    },
  },

  Mutation: {
    createLogEntry: async (
      _: unknown,
      { incidentId, cell, content }: { incidentId: string; cell: Cell; content: string },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, cellToResource(cell) as Parameters<typeof requirePermission>[1], 'WRITE');
      const userId = requireAuth(ctx);
      const data = validate(createLogEntrySchema, { content });
      return createLogEntry(incidentId, cell, data.content, userId, ctx.req?.ip);
    },

    editLogEntry: async (
      _: unknown,
      { id, content }: { id: string; content: string },
      ctx: GraphQLContext,
    ) => {
      const userId = requireAuth(ctx);
      const data = validate(createLogEntrySchema, { content });
      await checkCanModifyEntry(ctx, id, userId);
      return editLogEntry(id, data.content, userId, ctx.req?.ip);
    },

    deleteLogEntry: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      const userId = requireAuth(ctx);
      await checkCanModifyEntry(ctx, id, userId);
      return deleteLogEntry(id, userId, ctx.req?.ip);
    },

    addTagToLogEntry: async (
      _: unknown,
      { logEntryId, tagId }: { logEntryId: string; tagId: string },
      ctx: GraphQLContext,
    ) => {
      const userId = requireAuth(ctx);
      const entry = await prisma.logEntry.findFirst({ where: { id: logEntryId, deletedAt: null } });
      if (!entry) throw new GraphQLError('Entrée introuvable', { extensions: { code: 'NOT_FOUND' } });
      await requirePermission(ctx, cellToResource(entry.cell), 'WRITE');
      return addTagToLogEntry(logEntryId, tagId, userId);
    },

    removeTagFromLogEntry: async (
      _: unknown,
      { logEntryId, tagId }: { logEntryId: string; tagId: string },
      ctx: GraphQLContext,
    ) => {
      const userId = requireAuth(ctx);
      const entry = await prisma.logEntry.findFirst({ where: { id: logEntryId, deletedAt: null } });
      if (!entry) throw new GraphQLError('Entrée introuvable', { extensions: { code: 'NOT_FOUND' } });
      await requirePermission(ctx, cellToResource(entry.cell), 'WRITE');
      return removeTagFromLogEntry(logEntryId, tagId, userId);
    },
  },

  Subscription: {
    logEntryAdded: { subscribe: subscribeLogEntry(TOPICS.LOG_ENTRY_ADDED) },
    logEntryUpdated: { subscribe: subscribeLogEntry(TOPICS.LOG_ENTRY_UPDATED) },
  },

  LogEntry: {
    author: (parent: { author: unknown }) => parent.author,
    tags: (parent: { tags: Array<{ tag: unknown }> }) => parent.tags.map(t => t.tag),
    editedAt: (parent: { editedAt: Date | string | null }) => parent.editedAt ? new Date(parent.editedAt).toISOString() : null,
    createdAt: (parent: { createdAt: Date | string }) => new Date(parent.createdAt).toISOString(),
    updatedAt: (parent: { updatedAt: Date | string }) => new Date(parent.updatedAt).toISOString(),
  },
};
