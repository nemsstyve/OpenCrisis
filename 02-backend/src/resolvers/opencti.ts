import type { GraphQLContext } from '../context';
import { requireAuth, requirePermission } from '../middleware/rbac';
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
      return searchOpenCTIEntities(query.trim());
    },

    openctiStatus: () => process.env.OPENCTI_ENABLED === 'true',
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
      return linkTimelineEventToOpenCTI(eventId, openctiEntityId, openctiEntityType, userId, ctx.req?.ip);
    },

    unlinkTimelineEventFromOpenCTI: async (
      _: unknown,
      { eventId }: { eventId: string },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'TIMELINE', 'WRITE');
      const userId = requireAuth(ctx);
      return unlinkTimelineEventFromOpenCTI(eventId, userId, ctx.req?.ip);
    },

    exportIncidentToOpenCTI: async (
      _: unknown,
      { incidentId }: { incidentId: string },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'TIMELINE', 'WRITE');
      const userId = requireAuth(ctx);
      return exportIncidentToOpenCTI(incidentId, userId, ctx.req?.ip);
    },

    createOpenCTIObservable: async (
      _: unknown,
      { type, value, description }: { type: string; value: string; description?: string },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'TIMELINE', 'WRITE');
      const userId = requireAuth(ctx);
      return createOpenCTIObservable(type, value, description ?? '', userId, ctx.req?.ip);
    },
  },
};
