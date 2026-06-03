import { GraphQLError } from 'graphql';
import type { DocumentCategory } from '@prisma/client';
import type { GraphQLContext } from '../context';
import { requirePermission } from '../middleware/rbac';
import { pubsub, TOPICS } from '../pubsub';
import { getDocuments, getDocument, deleteDocument } from '../services/document';

export const documentResolvers = {
  Query: {
    documents: async (
      _: unknown,
      { incidentId, category }: { incidentId?: string; category?: DocumentCategory },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'DOCUMENTS', 'READ');
      return getDocuments(incidentId, category);
    },
    document: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      await requirePermission(ctx, 'DOCUMENTS', 'READ');
      return getDocument(id);
    },
  },

  Mutation: {
    deleteDocument: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      await requirePermission(ctx, 'DOCUMENTS', 'WRITE');
      if (!ctx.userId) throw new GraphQLError('Non authentifié', { extensions: { code: 'UNAUTHENTICATED' } });
      return deleteDocument(id, ctx.userId, ctx.req?.ip);
    },
  },

  Subscription: {
    documentUploaded: {
      subscribe: async (_: unknown, { incidentId }: { incidentId: string }, ctx: GraphQLContext) => {
        await requirePermission(ctx, 'DOCUMENTS', 'READ');
        return pubsub.asyncIterator(TOPICS.DOCUMENT_UPLOADED(incidentId));
      },
    },
  },

  Document: {
    uploadedBy: (parent: { uploadedBy: unknown }) => parent.uploadedBy,
    createdAt: (parent: { createdAt: Date }) => parent.createdAt.toISOString(),
  },
};
