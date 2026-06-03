import { GraphQLError } from 'graphql';
import type { GraphQLContext } from '../context';
import { requirePermission } from '../middleware/rbac';
import { pubsub, TOPICS } from '../pubsub';
import {
  getTimelineEvents, getTimelineEvent,
  createTimelineEvent, updateTimelineEvent, deleteTimelineEvent,
} from '../services/timeline';

export const timelineResolvers = {
  Query: {
    timelineEvents: async (_: unknown, { incidentId }: { incidentId: string }, ctx: GraphQLContext) => {
      await requirePermission(ctx, 'TIMELINE', 'READ');
      return getTimelineEvents(incidentId);
    },
    timelineEvent: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      await requirePermission(ctx, 'TIMELINE', 'READ');
      return getTimelineEvent(id);
    },
  },

  Mutation: {
    createTimelineEvent: async (
      _: unknown,
      { incidentId, input }: { incidentId: string; input: Parameters<typeof createTimelineEvent>[1] },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'TIMELINE', 'WRITE');
      if (!ctx.userId) throw new GraphQLError('Non authentifié', { extensions: { code: 'UNAUTHENTICATED' } });
      return createTimelineEvent(incidentId, input, ctx.userId, ctx.req?.ip);
    },

    updateTimelineEvent: async (
      _: unknown,
      { id, input }: { id: string; input: Parameters<typeof updateTimelineEvent>[1] },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'TIMELINE', 'WRITE');
      if (!ctx.userId) throw new GraphQLError('Non authentifié', { extensions: { code: 'UNAUTHENTICATED' } });
      return updateTimelineEvent(id, input, ctx.userId, ctx.req?.ip);
    },

    deleteTimelineEvent: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      await requirePermission(ctx, 'TIMELINE', 'WRITE');
      if (!ctx.userId) throw new GraphQLError('Non authentifié', { extensions: { code: 'UNAUTHENTICATED' } });
      return deleteTimelineEvent(id, ctx.userId, ctx.req?.ip);
    },
  },

  Subscription: {
    timelineEventAdded: {
      subscribe: async (_: unknown, { incidentId }: { incidentId: string }, ctx: GraphQLContext) => {
        await requirePermission(ctx, 'TIMELINE', 'READ');
        return pubsub.asyncIterator(TOPICS.TIMELINE_EVENT_ADDED(incidentId));
      },
    },
  },

  TimelineEvent: {
    actor: (parent: { actor: unknown }) => parent.actor,
    occurredAt: (parent: { occurredAt: Date }) => parent.occurredAt.toISOString(),
    createdAt: (parent: { createdAt: Date }) => parent.createdAt.toISOString(),
    updatedAt: (parent: { updatedAt: Date }) => parent.updatedAt.toISOString(),
  },
};
