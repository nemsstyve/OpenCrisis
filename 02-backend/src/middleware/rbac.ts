import { GraphQLError } from 'graphql';
import type { PermissionResource, PermissionAction } from '@prisma/client';
import type { GraphQLContext } from '../context';
import { prisma } from '../prisma';
import { USER_INCLUDE } from '../services/auth';
import { logAudit } from './audit';

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

/**
 * N6 — ré-autorise un flux d'abonnement périodiquement.
 * Un utilisateur dont la permission est révoquée cesse de recevoir les événements
 * dans le délai cacheTtlMs (défaut 60s). Évite une requête DB par événement (F6).
 * Échec fermé : toute erreur d'autorisation supprime l'événement.
 */
export async function* authorizedIterator<T>(
  source: AsyncIterator<T>,
  authorize: () => Promise<boolean>,
  cacheTtlMs = 60_000,
): AsyncGenerator<T> {
  let lastCheck = 0;
  let cachedAllowed = false;
  try {
    while (true) {
      const { value, done } = await source.next();
      if (done) return;
      const now = Date.now();
      if (now - lastCheck >= cacheTtlMs) {
        try {
          cachedAllowed = await authorize();
        } catch {
          cachedAllowed = false;
        }
        lastCheck = now;
      }
      if (cachedAllowed) yield value;
    }
  } finally {
    await source.return?.(undefined);
  }
}
