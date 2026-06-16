import { GraphQLError } from 'graphql';
import type { GraphQLContext } from '../context';
import { requirePermission } from '../middleware/rbac';
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

    openctiStatus: () => {
      return process.env.OPENCTI_ENABLED === 'true';
    },
  },

  Mutation: {
    linkTimelineEventToOpenCTI: async (
      _: unknown,
      {
        eventId,
        openctiEntityId,
        openctiEntityType,
      }: { eventId: string; openctiEntityId: string; openctiEntityType: string },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'TIMELINE', 'WRITE');
      if (!ctx.userId) {
        throw new GraphQLError('Non authentifie', { extensions: { code: 'UNAUTHENTICATED' } });
      }
      return linkTimelineEventToOpenCTI(
        eventId,
        openctiEntityId,
        openctiEntityType,
        ctx.userId,
        ctx.req?.ip,
      );
    },

    unlinkTimelineEventFromOpenCTI: async (
      _: unknown,
      { eventId }: { eventId: string },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'TIMELINE', 'WRITE');
      if (!ctx.userId) {
        throw new GraphQLError('Non authentifie', { extensions: { code: 'UNAUTHENTICATED' } });
      }
      return unlinkTimelineEventFromOpenCTI(eventId, ctx.userId, ctx.req?.ip);
    },

    createOpenCTIObservable: async (
      _: unknown,
      { type, value, description }: { type: string; value: string; description?: string },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'TIMELINE', 'WRITE');
      if (!ctx.userId) {
        throw new GraphQLError('Non authentifie', { extensions: { code: 'UNAUTHENTICATED' } });
      }
      return createOpenCTIObservable(type, value, description ?? '');
    },

    

    exportIncidentToOpenCTI: async (
      _: unknown,
      { incidentId }: { incidentId: string },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'TIMELINE', 'WRITE');
      if (!ctx.userId) {
        throw new GraphQLError('Non authentifie', { extensions: { code: 'UNAUTHENTICATED' } });
      }
      return exportIncidentToOpenCTI(incidentId, ctx.userId, ctx.req?.ip);
    },
  },
};
