import type { GraphQLContext } from '../context';
import { requirePermission, requireAuth, hasPermission, authorizedIterator } from '../middleware/rbac';
import { validate, createTimelineEventSchema, updateTimelineEventSchema } from '../utils/validation';
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
      const userId = requireAuth(ctx);
      const data = validate(createTimelineEventSchema, input);
      return createTimelineEvent(incidentId, data as Parameters<typeof createTimelineEvent>[1], userId, ctx.req?.ip);
    },

    updateTimelineEvent: async (
      _: unknown,
      { id, input }: { id: string; input: Parameters<typeof updateTimelineEvent>[1] },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'TIMELINE', 'WRITE');
      const userId = requireAuth(ctx);
      const data = validate(updateTimelineEventSchema, input);
      return updateTimelineEvent(id, data as Parameters<typeof updateTimelineEvent>[1], userId, ctx.req?.ip);
    },

    deleteTimelineEvent: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      await requirePermission(ctx, 'TIMELINE', 'WRITE');
      const userId = requireAuth(ctx);
      return deleteTimelineEvent(id, userId, ctx.req?.ip);
    },
  },

  Subscription: {
    timelineEventAdded: {
      subscribe: async (_: unknown, { incidentId }: { incidentId: string }, ctx: GraphQLContext) => {
        await requirePermission(ctx, 'TIMELINE', 'READ');
        return authorizedIterator(
          pubsub.asyncIterator(TOPICS.TIMELINE_EVENT_ADDED(incidentId)),
          () => hasPermission(ctx, 'TIMELINE', 'READ'),
        );
      },
    },
  },

  TimelineEvent: {
    actor: (parent: { actor: unknown }) => parent.actor,
    occurredAt: (parent: { occurredAt: Date | string }) => new Date(parent.occurredAt).toISOString(),
    createdAt: (parent: { createdAt: Date | string }) => new Date(parent.createdAt).toISOString(),
    updatedAt: (parent: { updatedAt: Date | string }) => new Date(parent.updatedAt).toISOString(),
  },
};
