import type { GraphQLContext } from '../context';
import { requireTenantId } from '../middleware/tenant';
import { tenantEventFilter } from '../middleware/tenantEventFilter';
import { requirePermission, requireAuth, hasPermission, authorizedIterator } from '../middleware/rbac';
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
      const tenantId = await requireTenantId(ctx);
      return getIncidents(tenantId);
    },
    incident: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      await requirePermission(ctx, 'DASHBOARD', 'READ');
      const tenantId = await requireTenantId(ctx);
      return getIncident(id, tenantId);
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
      const tenantId = await requireTenantId(ctx);
      const data = validate(createIncidentSchema, input);
      return createIncident(
        data as Parameters<typeof createIncident>[0],
        userId,
        tenantId,
        ctx.req?.ip,
      );
    },

    updateIncident: async (
      _: unknown,
      { id, input }: { id: string; input: Record<string, unknown> },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'DASHBOARD', 'WRITE');
      const userId = requireAuth(ctx);
      const tenantId = await requireTenantId(ctx);
      const data = validate(updateIncidentSchema, input);
      return updateIncident(
        id,
        data as Parameters<typeof updateIncident>[1],
        userId,
        tenantId,
        ctx.req?.ip,
      );
    },

    deleteIncident: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      await requirePermission(ctx, 'ADMIN', 'WRITE');
      const userId = requireAuth(ctx);
      const tenantId = await requireTenantId(ctx);
      return deleteIncident(id, userId, tenantId, ctx.req?.ip);
    },
  },

  Subscription: {
    incidentCreated: {
      subscribe: async (
        _: unknown,
        __: unknown,
        ctx: GraphQLContext,
      ) => {
        await requirePermission(ctx, 'DASHBOARD', 'READ');
        const tenantId = await requireTenantId(ctx);

        return tenantEventFilter(
          authorizedIterator(
            pubsub.asyncIterator(TOPICS.INCIDENT_CREATED),
            () => hasPermission(ctx, 'DASHBOARD', 'READ'),
            ctx,
          ),
          tenantId,
          () => requireTenantId(ctx),
          (event) => event?.incidentCreated?.tenantId,
        );
      },
    },

    incidentStatusChanged: {
      subscribe: async (
        _: unknown,
        { incidentId }: { incidentId: string },
        ctx: GraphQLContext,
      ) => {
        await requirePermission(ctx, 'DASHBOARD', 'READ');
        const tenantId = await requireTenantId(ctx);

        // Refuse immédiatement un incident étranger.
        await getIncident(incidentId, tenantId);

        return tenantEventFilter(
          authorizedIterator(
            pubsub.asyncIterator(
              TOPICS.INCIDENT_STATUS_CHANGED(incidentId),
            ),
            () => hasPermission(ctx, 'DASHBOARD', 'READ'),
            ctx,
          ),
          tenantId,
          () => requireTenantId(ctx),
          (event) => event?.incidentStatusChanged?.tenantId,
        );
      },
    },
  },

  Incident: {
    // N7 — réutilise le createdBy préchargé (getIncidents/getIncident) ; ne requête
    // qu'en repli (payloads de mutation/abonnement non inclus).
    createdBy: (parent: { createdById: string; createdBy?: unknown }) =>
      parent.createdBy ?? prisma.user.findUnique({ where: { id: parent.createdById } }),
    startedAt: (parent: { startedAt: Date }) => parent.startedAt.toISOString(),
    resolvedAt: (parent: { resolvedAt: Date | null }) => parent.resolvedAt?.toISOString() ?? null,
    createdAt: (parent: { createdAt: Date }) => parent.createdAt.toISOString(),
    updatedAt: (parent: { updatedAt: Date }) => parent.updatedAt.toISOString(),
  },
};
