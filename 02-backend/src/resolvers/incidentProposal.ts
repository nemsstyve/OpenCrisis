import { GraphQLError } from 'graphql';
import type { GraphQLContext } from '../context';
import { prisma } from '../prisma';
import {
  requireAuth,
  requirePermission,
} from '../middleware/rbac';
import { requireTenantId } from '../middleware/tenant';
import {
  approveIncidentProposal as approveProposal,
} from '../services/incidentProposalApproval';
import {
  rejectIncidentProposal as rejectProposal,
} from '../services/incidentProposalRejection';

function requireValidId(id: string): string {
  if (typeof id !== 'string' || !id.trim() || id.length > 200) {
    throw new GraphQLError('Identifiant invalide', {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }
  return id;
}

export const incidentProposalResolvers = {
  Query: {
    incidentProposals: async (
      _: unknown,
      args: {
        status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CONVERTED';
        limit?: number;
      },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'DASHBOARD', 'READ');
      const tenantId = await requireTenantId(ctx);

      const limit = args.limit ?? 50;

      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new GraphQLError(
          'La limite doit etre comprise entre 1 et 100',
          { extensions: { code: 'BAD_USER_INPUT' } },
        );
      }

      return prisma.incidentProposal.findMany({
        where: {
          tenantId,
          ...(args.status ? { status: args.status } : {}),
        },
        orderBy: [
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        take: limit,
      });
    },

    incidentProposal: async (
      _: unknown,
      args: { id: string },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'DASHBOARD', 'READ');
      const tenantId = await requireTenantId(ctx);
      const id = requireValidId(args.id);

      return prisma.incidentProposal.findFirst({
        where: { id, tenantId },
      });
    },
  },

  Mutation: {
    approveIncidentProposal: async (
      _: unknown,
      args: { id: string },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'DASHBOARD', 'WRITE');

      const reviewerId = requireAuth(ctx);
      const tenantId = await requireTenantId(ctx);
      const proposalId = requireValidId(args.id);

      return approveProposal(prisma, {
        proposalId,
        reviewerId,
        tenantId,
      });
    },

    rejectIncidentProposal: async (
      _: unknown,
      args: { id: string; reason: string },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'DASHBOARD', 'WRITE');

      const reviewerId = requireAuth(ctx);
      const tenantId = await requireTenantId(ctx);
      const proposalId = requireValidId(args.id);

      if (
        typeof args.reason !== 'string' ||
        args.reason.trim().length < 5 ||
        args.reason.length > 2000
      ) {
        throw new GraphQLError(
          'Justification invalide (5 a 2000 caracteres)',
          { extensions: { code: 'BAD_USER_INPUT' } },
        );
      }

      return rejectProposal(prisma, {
        proposalId,
        reviewerId,
        tenantId,
        reason: args.reason.trim(),
      });
    },
  },

  IncidentProposal: {
    reviewedAt: (parent: { reviewedAt: Date | null }) =>
      parent.reviewedAt?.toISOString() ?? null,
    receivedAt: (parent: { receivedAt: Date }) =>
      parent.receivedAt.toISOString(),
    createdAt: (parent: { createdAt: Date }) =>
      parent.createdAt.toISOString(),
    updatedAt: (parent: { updatedAt: Date }) =>
      parent.updatedAt.toISOString(),
  },
};
