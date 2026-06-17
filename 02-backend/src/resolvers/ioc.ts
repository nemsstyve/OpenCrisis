import { GraphQLError } from 'graphql';
import type { GraphQLContext } from '../context';
import { requirePermission } from '../middleware/rbac';
import { prisma } from '../prisma';
import { logAudit } from '../middleware/audit';

export const iocResolvers = {
  Query: {
    iocsByEvent: async (
      _: unknown,
      { timelineEventId }: { timelineEventId: string },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'TIMELINE', 'READ');
      return prisma.ioC.findMany({
        where: { timelineEventId },
        include: { createdBy: true },
        orderBy: { createdAt: 'desc' },
      });
    },
  },

  Mutation: {
    addIoC: async (
      _: unknown,
      { timelineEventId, type, value, description }: {
        timelineEventId: string; type: string; value: string; description?: string;
      },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'TIMELINE', 'WRITE');
      if (!ctx.userId) throw new GraphQLError('Non authentifie', { extensions: { code: 'UNAUTHENTICATED' } });

      const event = await prisma.timelineEvent.findUnique({ where: { id: timelineEventId } });
      if (!event) throw new GraphQLError('Evenement introuvable', { extensions: { code: 'NOT_FOUND' } });

      const ioc = await prisma.ioC.create({
        data: { timelineEventId, type: type as any, value, description, createdById: ctx.userId },
        include: { createdBy: true },
      });

      logAudit({ userId: ctx.userId, action: 'ADD_IOC', resource: 'TIMELINE',
        resourceId: timelineEventId, incidentId: event.incidentId,
        metadata: { type, value }, ipAddress: ctx.req?.ip });

      return ioc;
    },

    removeIoC: async (
      _: unknown,
      { id }: { id: string },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'TIMELINE', 'WRITE');
      if (!ctx.userId) throw new GraphQLError('Non authentifie', { extensions: { code: 'UNAUTHENTICATED' } });

      const ioc = await prisma.ioC.findUnique({ where: { id } });
      if (!ioc) throw new GraphQLError('IoC introuvable', { extensions: { code: 'NOT_FOUND' } });

      await prisma.ioC.delete({ where: { id } });

      logAudit({ userId: ctx.userId, action: 'REMOVE_IOC', resource: 'TIMELINE',
        resourceId: ioc.timelineEventId, metadata: { type: ioc.type, value: ioc.value },
        ipAddress: ctx.req?.ip });

      return true;
    },
  },
};
