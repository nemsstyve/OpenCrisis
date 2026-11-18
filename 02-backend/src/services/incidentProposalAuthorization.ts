import type { Prisma } from '@prisma/client';

/**
 * Autorisation interne des decisions sur propositions.
 * Ne jamais utiliser un tenantId transmis par une alerte.
 * L'API doit fournir l'identite et le tenant verifies
 * depuis la session authentifiee.
 */
export async function assertProposalDecisionPermission(
  tx: Prisma.TransactionClient,
  reviewerId: string,
  tenantId: string,
): Promise<void> {
  // Synchronise les decisions avec les mutations administratives.
  // Le verrou doit preceder toute lecture RBAC dans la transaction.
  const lockedTenants = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "Tenant"
    WHERE "id" = ${tenantId}
      AND "isActive" = true
    FOR SHARE
  `;

  if (lockedTenants.length !== 1) {
    throw new Error('Entreprise non autorisee');
  }

  const reviewer = await tx.user.findFirst({
    where: {
      id: reviewerId,
      tenantId,
      isActive: true,
      deletedAt: null,
      mustChangePassword: false,
      tenant: { isActive: true },
    },
    select: { id: true },
  });

  if (!reviewer) {
    throw new Error('Validateur non autorise');
  }

  const role = await tx.roleAssignment.findFirst({
    where: {
      userId: reviewerId,
      role: {
        is: {
          OR: [
            { isSystem: true, tenantId: null },
            { isSystem: false, tenantId },
          ],
          permissions: {
            some: {
              permission: {
                resource: 'DASHBOARD',
                action: 'WRITE',
              },
            },
          },
        },
      },
    },
    select: { id: true },
  });

  if (!role) {
    throw new Error('Permission DASHBOARD:WRITE requise');
  }
}
