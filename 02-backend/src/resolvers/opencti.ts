import type { GraphQLContext } from '../context';
import { requireAuth, requirePermission } from '../middleware/rbac';
import { requireTenantId } from '../middleware/tenant';
import {
  searchOpenCTIEntities,
  linkTimelineEventToOpenCTI,
  unlinkTimelineEventFromOpenCTI,
  exportIncidentToOpenCTI,
  createOpenCTIObservable,
} from '../services/opencti';

export const openctiResolvers = {
  Query: {
    searchOpenCTI: async (
      _: unknown,
      { query }: { query: string },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'TIMELINE', 'READ');
      if (!query || query.trim().length < 2) return [];
      await requireTenantId(ctx);
        return searchOpenCTIEntities(query.trim());
    },

    openctiStatus: (_: unknown, __: unknown, ctx: GraphQLContext) => {
      requireAuth(ctx);
      return false;
    },
  },

  Mutation: {
    linkTimelineEventToOpenCTI: async (
      _: unknown,
      { eventId, openctiEntityId, openctiEntityType }: {
        eventId: string;
        openctiEntityId: string;
        openctiEntityType: string;
      },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'TIMELINE', 'WRITE');
      const userId = requireAuth(ctx);
      return linkTimelineEventToOpenCTI(
          eventId,
          openctiEntityId,
          openctiEntityType,
          userId,
          ctx.req?.ip,
        );
    },

    unlinkTimelineEventFromOpenCTI: async (
      _: unknown,
      { eventId }: { eventId: string },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'TIMELINE', 'WRITE');
      const userId = requireAuth(ctx);
      return unlinkTimelineEventFromOpenCTI(
          eventId,
          userId,
          ctx.req?.ip,
        );
    },

    exportIncidentToOpenCTI: async (
      _: unknown,
      { incidentId }: { incidentId: string },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'TIMELINE', 'WRITE');
      const userId = requireAuth(ctx);
      await requireTenantId(ctx);
        return exportIncidentToOpenCTI(
          incidentId,
          userId,
          ctx.req?.ip,
        );
    },

    createOpenCTIObservable: async (
      _: unknown,
      { type, value, description }: { type: string; value: string; description?: string },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'TIMELINE', 'WRITE');
      const userId = requireAuth(ctx);
      await requireTenantId(ctx);
        return createOpenCTIObservable(
          type,
          value,
          description ?? '',
          userId,
          ctx.req?.ip,
        );
    },
  },
};
