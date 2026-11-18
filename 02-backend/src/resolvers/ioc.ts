import { GraphQLError } from 'graphql';
import type { GraphQLContext } from '../context';
import { requirePermission } from '../middleware/rbac';
import { requireTenantId } from '../middleware/tenant';
import { prisma } from '../prisma';
import { logAudit } from '../middleware/audit';

function notFound(): never {
  throw new GraphQLError('IoC introuvable', {
    extensions: { code: 'NOT_FOUND' },
  });
}

export const iocResolvers = {
  Query: {
    iocsByEvent: async (
      _: unknown,
      { timelineEventId }: { timelineEventId: string },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'TIMELINE', 'READ');
      const tenantId = await requireTenantId(ctx);

      const event = await prisma.timelineEvent.findFirst({
        where: {
          id: timelineEventId,
          deletedAt: null,
          incident: {
            tenantId,
            deletedAt: null,
          },
        },
        select: { id: true },
      });

      if (!event) return notFound();

      return prisma.ioC.findMany({
        where: {
          timelineEventId,
          timelineEvent: {
            deletedAt: null,
            incident: {
              tenantId,
              deletedAt: null,
            },
          },
        },
        include: { createdBy: true },
        orderBy: { createdAt: 'desc' },
      });
    },
  },

  Mutation: {
    addIoC: async (
      _: unknown,
      {
        timelineEventId,
        type,
        value,
        description,
      }: {
        timelineEventId: string;
        type: string;
        value: string;
        description?: string;
      },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'TIMELINE', 'WRITE');
      const tenantId = await requireTenantId(ctx);

      if (!ctx.userId) {
        throw new GraphQLError('Non authentifie', {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }

      const event = await prisma.timelineEvent.findFirst({
        where: {
          id: timelineEventId,
          deletedAt: null,
          incident: {
            tenantId,
            deletedAt: null,
          },
        },
        select: { incidentId: true },
      });

      if (!event) return notFound();

      const ioc = await prisma.ioC.create({
        data: {
          timelineEventId,
          type: type as any,
          value,
          description,
          createdById: ctx.userId,
        },
        include: { createdBy: true },
      });

      logAudit({
        userId: ctx.userId,
        action: 'ADD_IOC',
        resource: 'TIMELINE',
        resourceId: timelineEventId,
        incidentId: event.incidentId,
        metadata: { type, value },
        ipAddress: ctx.req?.ip,
      });

      return ioc;
    },

    removeIoC: async (
      _: unknown,
      { id }: { id: string },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'TIMELINE', 'WRITE');
      const tenantId = await requireTenantId(ctx);

      if (!ctx.userId) {
        throw new GraphQLError('Non authentifie', {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }

      const scope = {
        id,
        timelineEvent: {
          deletedAt: null,
          incident: {
            tenantId,
            deletedAt: null,
          },
        },
      };

      const ioc = await prisma.ioC.findFirst({
        where: scope,
        select: {
          id: true,
          type: true,
          value: true,
          timelineEventId: true,
          timelineEvent: {
            select: { incidentId: true },
          },
        },
      });

      if (!ioc) return notFound();

      // Condition d'appartenance conservee dans le DELETE SQL.
      const deleted = await prisma.ioC.deleteMany({
        where: scope,
      });

      if (deleted.count !== 1) return notFound();

      logAudit({
        userId: ctx.userId,
        action: 'REMOVE_IOC',
        resource: 'TIMELINE',
        resourceId: ioc.timelineEventId,
        incidentId: ioc.timelineEvent.incidentId,
        metadata: { type: ioc.type, value: ioc.value },
        ipAddress: ctx.req?.ip,
      });

      return true;
    },
  },
};
