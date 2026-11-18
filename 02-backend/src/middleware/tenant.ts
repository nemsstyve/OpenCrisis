import { GraphQLError } from 'graphql';
import type { GraphQLContext } from '../context';
import { prisma } from '../prisma';

/**
 * Résout le tenant depuis l'utilisateur authentifié.
 *
 * Ne fait jamais confiance à un tenantId fourni par le client
 * ou à une simple valeur présente dans le JWT.
 *
 * En absence de tenant actif, l'accès est refusé.
 */
export async function requireTenantId(
  ctx: GraphQLContext,
): Promise<string> {
  if (!ctx.userId) {
    throw new GraphQLError('Non authentifié', {
      extensions: { code: 'UNAUTHENTICATED' },
    });
  }

  const user = await prisma.user.findFirst({
    where: {
      id: ctx.userId,
      deletedAt: null,
      isActive: true,
    },
    select: {
      tenantId: true,
      tenant: {
        select: { isActive: true },
      },
    },
  });

  if (!user?.tenantId || !user.tenant?.isActive) {
    throw new GraphQLError(
      'Accès refusé : entreprise non autorisée',
      { extensions: { code: 'FORBIDDEN' } },
    );
  }

  return user.tenantId;
}


/**
 * Vérifie l'appartenance d'un incident au tenant actif de l'utilisateur.
 * L'absence ou la différence de tenant entraîne un refus.
 */
export async function assertIncidentReadable(
  incidentId: string,
  userId: string,
): Promise<void> {
  const tenantId = await requireTenantId({
    userId,
    req: null,
    res: null,
  });

  const incident = await prisma.incident.findFirst({
    where: {
      id: incidentId,
      tenantId,
      deletedAt: null,
    },
    select: { id: true },
  });

  if (!incident) {
    throw new GraphQLError('Incident introuvable', {
      extensions: { code: 'NOT_FOUND' },
    });
  }
}
