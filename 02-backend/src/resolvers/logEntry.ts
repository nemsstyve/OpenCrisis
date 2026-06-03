import { GraphQLError } from 'graphql';
import type { Cell } from '@prisma/client';
import type { GraphQLContext } from '../context';
import { requirePermission, hasPermission } from '../middleware/rbac';
import { prisma } from '../prisma';
import { pubsub, TOPICS } from '../pubsub';
import {
  getLogEntries, createLogEntry, editLogEntry,
  deleteLogEntry, addTagToLogEntry, removeTagFromLogEntry,
} from '../services/logEntry';

// Cellule → ressource RBAC
function cellToResource(cell: Cell) {
  return cell === 'OPERATIONAL' ? 'MAIN_COURANTE_OPS' : 'MAIN_COURANTE_DIR';
}

export const logEntryResolvers = {
  Query: {
    logEntries: async (
      _: unknown,
      { incidentId, cell }: { incidentId: string; cell?: Cell },
      ctx: GraphQLContext,
    ) => {
      const resource = cell ? cellToResource(cell) : 'MAIN_COURANTE_DIR';
      await requirePermission(ctx, resource as Parameters<typeof requirePermission>[1], 'READ');
      return getLogEntries(incidentId, cell);
    },
  },

  Mutation: {
    createLogEntry: async (
      _: unknown,
      { incidentId, cell, content }: { incidentId: string; cell: Cell; content: string },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, cellToResource(cell) as Parameters<typeof requirePermission>[1], 'WRITE');
      if (!ctx.userId) throw new GraphQLError('Non authentifié', { extensions: { code: 'UNAUTHENTICATED' } });
      return createLogEntry(incidentId, cell, content, ctx.userId, ctx.req?.ip);
    },

    editLogEntry: async (
      _: unknown,
      { id, content }: { id: string; content: string },
      ctx: GraphQLContext,
    ) => {
      if (!ctx.userId) throw new GraphQLError('Non authentifié', { extensions: { code: 'UNAUTHENTICATED' } });

      const entry = await prisma.logEntry.findFirst({ where: { id, deletedAt: null } });
      if (!entry) throw new GraphQLError('Entrée introuvable', { extensions: { code: 'NOT_FOUND' } });

      // DÉC-2 : auteur OU utilisateur avec WRITE sur la cellule (Pilote / Admin)
      const isAuthor = entry.authorId === ctx.userId;
      if (!isAuthor) {
        const canEdit = await hasPermission(ctx, cellToResource(entry.cell), 'WRITE');
        if (!canEdit) throw new GraphQLError('Permission refusée', { extensions: { code: 'FORBIDDEN' } });
      }

      return editLogEntry(id, content, ctx.userId, ctx.req?.ip);
    },

    deleteLogEntry: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      if (!ctx.userId) throw new GraphQLError('Non authentifié', { extensions: { code: 'UNAUTHENTICATED' } });

      const entry = await prisma.logEntry.findFirst({ where: { id, deletedAt: null } });
      if (!entry) throw new GraphQLError('Entrée introuvable', { extensions: { code: 'NOT_FOUND' } });

      // DÉC-2 : auteur OU utilisateur avec WRITE sur la cellule (Pilote / Admin)
      const isAuthor = entry.authorId === ctx.userId;
      if (!isAuthor) {
        const canEdit = await hasPermission(ctx, cellToResource(entry.cell), 'WRITE');
        if (!canEdit) throw new GraphQLError('Permission refusée', { extensions: { code: 'FORBIDDEN' } });
      }

      return deleteLogEntry(id, ctx.userId, ctx.req?.ip);
    },

    addTagToLogEntry: async (
      _: unknown,
      { logEntryId, tagId }: { logEntryId: string; tagId: string },
      ctx: GraphQLContext,
    ) => {
      if (!ctx.userId) throw new GraphQLError('Non authentifié', { extensions: { code: 'UNAUTHENTICATED' } });

      const entry = await prisma.logEntry.findFirst({ where: { id: logEntryId, deletedAt: null } });
      if (!entry) throw new GraphQLError('Entrée introuvable', { extensions: { code: 'NOT_FOUND' } });
      await requirePermission(ctx, cellToResource(entry.cell), 'WRITE');

      return addTagToLogEntry(logEntryId, tagId, ctx.userId);
    },

    removeTagFromLogEntry: async (
      _: unknown,
      { logEntryId, tagId }: { logEntryId: string; tagId: string },
      ctx: GraphQLContext,
    ) => {
      if (!ctx.userId) throw new GraphQLError('Non authentifié', { extensions: { code: 'UNAUTHENTICATED' } });

      const entry = await prisma.logEntry.findFirst({ where: { id: logEntryId, deletedAt: null } });
      if (!entry) throw new GraphQLError('Entrée introuvable', { extensions: { code: 'NOT_FOUND' } });
      await requirePermission(ctx, cellToResource(entry.cell), 'WRITE');

      return removeTagFromLogEntry(logEntryId, tagId, ctx.userId);
    },
  },

  Subscription: {
    logEntryAdded: {
      subscribe: async (_: unknown, { incidentId, cell }: { incidentId: string; cell?: Cell }, ctx: GraphQLContext) => {
        const resource = cell ? cellToResource(cell) : 'MAIN_COURANTE_DIR';
        await requirePermission(ctx, resource as Parameters<typeof requirePermission>[1], 'READ');
        return pubsub.asyncIterator(TOPICS.LOG_ENTRY_ADDED(incidentId, cell ?? 'ALL'));
      },
    },
    logEntryUpdated: {
      subscribe: async (_: unknown, { incidentId, cell }: { incidentId: string; cell?: Cell }, ctx: GraphQLContext) => {
        const resource = cell ? cellToResource(cell) : 'MAIN_COURANTE_DIR';
        await requirePermission(ctx, resource as Parameters<typeof requirePermission>[1], 'READ');
        return pubsub.asyncIterator(TOPICS.LOG_ENTRY_UPDATED(incidentId, cell ?? 'ALL'));
      },
    },
  },

  LogEntry: {
    author: (parent: { author: unknown }) => parent.author,
    tags: (parent: { tags: Array<{ tag: unknown }> }) => parent.tags.map(t => t.tag),
    editedAt: (parent: { editedAt: Date | null }) => parent.editedAt?.toISOString() ?? null,
    createdAt: (parent: { createdAt: Date }) => parent.createdAt.toISOString(),
    updatedAt: (parent: { updatedAt: Date }) => parent.updatedAt.toISOString(),
  },
};
