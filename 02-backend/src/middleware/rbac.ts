import { GraphQLError } from 'graphql';
import type { PermissionResource, PermissionAction } from '@prisma/client';
import type { GraphQLContext } from '../context';
import { prisma } from '../prisma';
import { USER_INCLUDE } from '../services/auth';
import { logAudit } from './audit';

/**
 * Vérifie sans lever d'exception si l'utilisateur possède une permission.
 * Utile pour les vérifications conditionnelles (ex. auteur OU pilote).
 */
export async function hasPermission(
  ctx: GraphQLContext,
  resource: PermissionResource,
  action: PermissionAction,
): Promise<boolean> {
  if (!ctx.userId) return false;

  const user = await prisma.user.findFirst({
    where: { id: ctx.userId, deletedAt: null, isActive: true },
    include: USER_INCLUDE,
  });

  if (!user) return false;

  return user.roleAssignments.some(ra =>
    ra.role.permissions.some(
      rp => rp.permission.resource === resource && rp.permission.action === action,
    ),
  );
}

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
    // E1 — journaliser chaque refus de permission
    logAudit({
      userId: ctx.userId,
      action: 'PERMISSION_DENIED',
      resource,
      metadata: { action, userId: ctx.userId },
      ipAddress: ctx.req?.ip ?? null,
    });
    throw new GraphQLError('Permission refusée', { extensions: { code: 'FORBIDDEN' } });
  }
}
