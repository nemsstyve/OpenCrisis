import { GraphQLError } from 'graphql';
import type { GraphQLContext } from '../context';
import { prisma } from '../prisma';
import { requirePermission } from '../middleware/rbac';
import { requireTenantId } from '../middleware/tenant';

export const wazuhCorrelationHistoryResolvers = {
  Query: {
    wazuhCorrelations: async (
      _: unknown,
      args: { limit?: number },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'DASHBOARD', 'READ');

      // Jamais de tenantId accepte depuis le navigateur.
      const tenantId = await requireTenantId(ctx);
      const limit = args.limit ?? 50;

      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new GraphQLError('Limite invalide', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      return prisma.wazuhCorrelationRecord.findMany({
        where: { tenantId },
        select: {
          id: true,
          sourceId: true,
          externalEventId: true,
          matched: true,
          confidence: true,
          matches: true,
          correlatedAt: true,
        },
        orderBy: [
          { correlatedAt: 'desc' },
          { id: 'desc' },
        ],
        take: limit,
      });
    },
  },

  WazuhCorrelationRecord: {
    correlatedAt: (record: { correlatedAt: Date }) =>
      record.correlatedAt.toISOString(),

    analystReviewRequired: () => true,

    incidentAutomaticallyCreated: () => false,

    matches: (record: { matches: unknown }) =>
      Array.isArray(record.matches) ? record.matches : [],
  },
};
