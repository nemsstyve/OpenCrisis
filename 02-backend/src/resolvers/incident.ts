import type { GraphQLContext } from '../context';
import { requirePermission, requireAuth } from '../middleware/rbac';
import { validate, createIncidentSchema, updateIncidentSchema } from '../utils/validation';
import { pubsub, TOPICS } from '../pubsub';
import {
  getIncidents, getIncident,
  createIncident, updateIncident, deleteIncident,
} from '../services/incident';
import { prisma } from '../prisma';

export const incidentResolvers = {
  Query: {
    incidents: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      await requirePermission(ctx, 'DASHBOARD', 'READ');
      return getIncidents();
    },
    incident: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      await requirePermission(ctx, 'DASHBOARD', 'READ');
      return getIncident(id);
    },
  },

  Mutation: {
    createIncident: async (
      _: unknown,
      { input }: { input: { name: string; description?: string; severity?: string } },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'DASHBOARD', 'WRITE');
      const userId = requireAuth(ctx);
      const data = validate(createIncidentSchema, input);
      return createIncident(data as Parameters<typeof createIncident>[0], userId, ctx.req?.ip);
    },

    updateIncident: async (
      _: unknown,
      { id, input }: { id: string; input: Record<string, unknown> },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'DASHBOARD', 'WRITE');
      const userId = requireAuth(ctx);
      const data = validate(updateIncidentSchema, input);
      return updateIncident(id, data as Parameters<typeof updateIncident>[1], userId, ctx.req?.ip);
    },

    deleteIncident: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      await requirePermission(ctx, 'ADMIN', 'WRITE');
      const userId = requireAuth(ctx);
      return deleteIncident(id, userId, ctx.req?.ip);
    },
  },

  Subscription: {
    incidentCreated: {
      subscribe: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
        await requirePermission(ctx, 'DASHBOARD', 'READ');
        return pubsub.asyncIterator(TOPICS.INCIDENT_CREATED);
      },
    },
    incidentStatusChanged: {
      subscribe: async (_: unknown, { incidentId }: { incidentId: string }, ctx: GraphQLContext) => {
        await requirePermission(ctx, 'DASHBOARD', 'READ');
        return pubsub.asyncIterator(TOPICS.INCIDENT_STATUS_CHANGED(incidentId));
      },
    },
  },

  Incident: {
    createdBy: (parent: { createdById: string }) =>
      prisma.user.findUnique({ where: { id: parent.createdById } }),
    startedAt: (parent: { startedAt: Date }) => parent.startedAt.toISOString(),
    resolvedAt: (parent: { resolvedAt: Date | null }) => parent.resolvedAt?.toISOString() ?? null,
    createdAt: (parent: { createdAt: Date }) => parent.createdAt.toISOString(),
    updatedAt: (parent: { updatedAt: Date }) => parent.updatedAt.toISOString(),
  },
};
