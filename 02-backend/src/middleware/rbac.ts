import { GraphQLError } from 'graphql';
import type { PermissionResource, PermissionAction } from '@prisma/client';
import type { GraphQLContext } from '../context';
import { prisma } from '../prisma';
import { USER_INCLUDE } from '../services/auth';

export async function requirePermission(
  ctx: GraphQLContext,
  resource: PermissionResource,
  action: PermissionAction,
): Promise<void> {
  if (!ctx.userId) {
    throw new GraphQLError('Non authentifié', { extensions: { code: 'UNAUTHENTICATED' } });
  }

  const user = await prisma.user.findFirst({
    where: { id: ctx.userId, deletedAt: null, isActive: true },
    include: USER_INCLUDE,
  });

  if (!user) {
    throw new GraphQLError('Utilisateur introuvable', { extensions: { code: 'UNAUTHENTICATED' } });
  }

  const hasPermission = user.roleAssignments.some(ra =>
    ra.role.permissions.some(
      rp => rp.permission.resource === resource && rp.permission.action === action,
    ),
  );

  if (!hasPermission) {
    throw new GraphQLError('Permission refusée', { extensions: { code: 'FORBIDDEN' } });
  }
}
