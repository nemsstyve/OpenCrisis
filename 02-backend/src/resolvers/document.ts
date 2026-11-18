import type { DocumentCategory } from '@prisma/client';
import type { GraphQLContext } from '../context';
import { requireTenantId } from '../middleware/tenant';
import { getIncident } from '../services/incident';
import { tenantEventFilter } from '../middleware/tenantEventFilter';
import { requirePermission, requireAuth, hasPermission, authorizedIterator } from '../middleware/rbac';
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
      const tenantId = await requireTenantId(ctx);
      return getDocuments(tenantId, incidentId, category);
    },
    document: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      await requirePermission(ctx, 'DOCUMENTS', 'READ');
      const tenantId = await requireTenantId(ctx);
      return getDocument(id, tenantId);
    },
  },

  Mutation: {
    deleteDocument: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      await requirePermission(ctx, 'DOCUMENTS', 'WRITE');
      const userId = requireAuth(ctx);
      const tenantId = await requireTenantId(ctx);
      return deleteDocument(id, userId, tenantId, ctx.req?.ip);
    },
  },

  Subscription: {
    documentUploaded: {
      subscribe: async (_: unknown, { incidentId }: { incidentId: string }, ctx: GraphQLContext) => {
        await requirePermission(ctx, 'DOCUMENTS', 'READ');
        const tenantId = await requireTenantId(ctx);
        await getIncident(incidentId, tenantId);

        return tenantEventFilter(
          authorizedIterator(
            pubsub.asyncIterator(TOPICS.DOCUMENT_UPLOADED(incidentId)),
            () => hasPermission(ctx, 'DOCUMENTS', 'READ'),
            ctx,
          ),
          tenantId,
          () => requireTenantId(ctx),
          (event) => event?.documentUploaded?.tenantId,
        );
      },
    },
  },

  Document: {
    uploadedBy: (parent: { uploadedBy: unknown }) => parent.uploadedBy,
    createdAt: (parent: { createdAt: Date }) => parent.createdAt.toISOString(),
  },
};
