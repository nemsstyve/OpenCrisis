import { GraphQLError } from 'graphql';
import type { GraphQLContext } from '../context';
import { prisma } from '../prisma';

import {
  requireAuth,
  requirePermission,
} from '../middleware/rbac';

import { requireTenantId } from '../middleware/tenant';

import {
  createWazuhConnector,
  rotateWazuhConnectorSecret,
  revokeWazuhConnector,
} from '../services/wazuhConnectorAdministration';

function validId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value !== value.trim() ||
    value.length > 255
  ) {
    throw new GraphQLError('Identifiant invalide', {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }

  return value;
}

/*
 * Ne jamais renvoyer aux clients GraphQL
 * les details techniques Prisma ou SQL.
 * Ne jamais journaliser les secrets.
 */
async function protectedMutation<T>(
  callback: () => Promise<T>,
): Promise<T> {
  try {
    return await callback();
  } catch {
    throw new GraphQLError(
      'Operation sur le connecteur impossible',
      { extensions: { code: 'OPERATION_FAILED' } },
    );
  }
}

export const wazuhConnectorResolvers = {
  Query: {
    adminWazuhConnectors: async (
      _: unknown,
      args: { limit?: number },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'ADMIN', 'READ');
      const tenantId = await requireTenantId(ctx);

      const limit = args.limit ?? 50;

      if (
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 100
      ) {
        throw new GraphQLError(
          'Limite invalide : 1 a 100',
          { extensions: { code: 'BAD_USER_INPUT' } },
        );
      }

      return prisma.wazuhConnector.findMany({
        where: { tenantId },
        select: {
          id: true,
          name: true,
          sourceId: true,
          isActive: true,
          revokedAt: true,
          lastUsedAt: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: [
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        take: limit,
      });
    },
  },

  Mutation: {
    adminCreateWazuhConnector: async (
      _: unknown,
      args: {
        input: { name: string; sourceId: string };
      },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'ADMIN', 'WRITE');

      const actorUserId = requireAuth(ctx);
      const tenantId = await requireTenantId(ctx);

      return protectedMutation(() =>
        createWazuhConnector(
          prisma,
          { actorUserId, tenantId },
          args.input,
        ),
      );
    },

    adminRotateWazuhConnectorSecret: async (
      _: unknown,
      args: { id: string },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'ADMIN', 'WRITE');

      const actorUserId = requireAuth(ctx);
      const tenantId = await requireTenantId(ctx);
      const connectorId = validId(args.id);

      return protectedMutation(() =>
        rotateWazuhConnectorSecret(
          prisma,
          { actorUserId, tenantId },
          connectorId,
        ),
      );
    },

    adminRevokeWazuhConnector: async (
      _: unknown,
      args: { id: string },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'ADMIN', 'WRITE');

      const actorUserId = requireAuth(ctx);
      const tenantId = await requireTenantId(ctx);
      const connectorId = validId(args.id);

      return protectedMutation(() =>
        revokeWazuhConnector(
          prisma,
          { actorUserId, tenantId },
          connectorId,
        ),
      );
    },
  },

  WazuhConnector: {
    revokedAt: (parent: { revokedAt: Date | null }) =>
      parent.revokedAt?.toISOString() ?? null,

    lastUsedAt: (parent: { lastUsedAt: Date | null }) =>
      parent.lastUsedAt?.toISOString() ?? null,

    createdAt: (parent: { createdAt: Date }) =>
      parent.createdAt.toISOString(),

    updatedAt: (parent: { updatedAt: Date }) =>
      parent.updatedAt.toISOString(),
  },
};
