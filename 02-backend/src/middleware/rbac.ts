import { GraphQLError } from 'graphql';
import type { PermissionResource, PermissionAction } from '@prisma/client';
import type { GraphQLContext } from '../context';
import { prisma } from '../prisma';
import { USER_INCLUDE } from '../services/auth';
import { logAudit } from './audit';
import { requireTenantId } from './tenant';
import { verifyActiveAccessToken } from './auth';

/**
 * Exige une session authentifiée et renvoie l'identifiant utilisateur garanti non-null.
 * Remplace les vérifications `if (!ctx.userId)` répétées dans les resolvers.
 */
export function requireAuth(ctx: GraphQLContext): string {
  if (!ctx.userId) {
    throw new GraphQLError('Non authentifié', { extensions: { code: 'UNAUTHENTICATED' } });
  }
  return ctx.userId;
}

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
  if (user.mustChangePassword) return false;

  let tenantId: string;
  try {
    tenantId = await requireTenantId(ctx);
  } catch {
    return false;
  }

  return user.roleAssignments.some(ra =>
    (
      ra.role.isSystem
        ? ra.role.tenantId === null
        : ra.role.tenantId === tenantId
    ) &&
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

  // Tant que le mot de passe temporaire n'est pas changé, aucune opération gardée
  // n'est autorisée (le forçage n'était jusqu'ici appliqué que côté front). Les
  // résolveurs me/logout/refreshToken/changePassword n'utilisent pas requirePermission.
  if (user.mustChangePassword) {
    throw new GraphQLError('Vous devez changer votre mot de passe avant de continuer', {
      extensions: { code: 'PASSWORD_CHANGE_REQUIRED' },
    });
  }

  const tenantId = await requireTenantId(ctx);

  const hasPermission = user.roleAssignments.some(ra =>
    (
      ra.role.isSystem
        ? ra.role.tenantId === null
        : ra.role.tenantId === tenantId
    ) &&
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

/**
 * Revalide chaque evenement d'abonnement :
 * - JWT et version de session, sans cache ;
 * - ressource concernee si applicable ;
 * - permissions courantes, sans cache.
 *
 * Toute revocation ou erreur ferme le flux.
 */
export async function* authorizedIterator<T>(
  source: AsyncIterator<T>,
  authorize: () => Promise<boolean>,
  ctx: GraphQLContext,
  verifyResource?: () => Promise<void>,
  filterEvent?: (event: T) => Promise<boolean>,
): AsyncGenerator<T> {
  try {
    while (true) {
      const { value, done } = await source.next();

      if (done) return;

      // Authentification et version de session
      // reverifiees avant chaque evenement.
      if (!ctx.userId || !ctx.accessToken) return;

      const payload = await verifyActiveAccessToken(
        ctx.accessToken,
      );

      if (!payload || payload.userId !== ctx.userId) {
        return;
      }

      try {
        if (verifyResource) {
          await verifyResource();
        }

        if (!(await authorize())) {
          return;
        }

        // Un evenement peut devenir interdit alors
        // que l'utilisateur conserve d'autres droits.
        // On ignore cet evenement sans fermer
        // l'abonnement toujours legitime.
        if (filterEvent && !(await filterEvent(value))) {
          continue;
        }
      } catch {
        // Erreur de verification : fermer le flux.
        return;
      }

      yield value;
    }
  } finally {
    await source.return?.(undefined);
  }
}
