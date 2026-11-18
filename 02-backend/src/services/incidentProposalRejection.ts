import type { PrismaClient } from '@prisma/client';
import { assertProposalDecisionPermission } from
  './incidentProposalAuthorization';

export interface RejectIncidentProposalRequest {
  proposalId: string;
  tenantId: string;
  reviewerId: string;
  reason: string;
}

/**
 * Refuse une proposition PENDING.
 * Aucune creation d'incident n'est effectuee.
 * Le rejet et son audit partagent la meme transaction.
 */
export async function rejectIncidentProposal(
  prisma: PrismaClient,
  request: RejectIncidentProposalRequest,
): Promise<{ proposalId: string; status: 'REJECTED' }> {
  if (
    !request.proposalId?.trim() ||
    !request.tenantId?.trim() ||
    !request.reviewerId?.trim() ||
    typeof request.reason !== 'string' ||
    request.reason.trim().length < 5 ||
    request.reason.length > 2000
  ) {
    throw new Error('Demande de rejet invalide');
  }

  return prisma.$transaction(
    async (tx) => {
      await assertProposalDecisionPermission(
        tx,
        request.reviewerId,
        request.tenantId,
      );

      const updated = await tx.incidentProposal.updateMany({
        where: {
          id: request.proposalId,
          tenantId: request.tenantId,
          status: 'PENDING',
          incidentId: null,
          reviewedById: null,
        },
        data: {
          status: 'REJECTED',
          reviewedById: request.reviewerId,
          reviewedAt: new Date(),
        },
      });

      if (updated.count !== 1) {
        throw new Error(
          'Proposition indisponible ou deja traitee',
        );
      }

      await tx.auditLog.create({
        data: {
          tenantId: request.tenantId,
          userId: request.reviewerId,
          action: 'REJECT_INCIDENT_PROPOSAL',
          resource: 'INCIDENT_PROPOSAL',
          resourceId: request.proposalId,
          metadata: {
            proposalId: request.proposalId,
            reason: request.reason.trim(),
          },
        },
      });

      return {
        proposalId: request.proposalId,
        status: 'REJECTED' as const,
      };
    },
    {
      isolationLevel: 'ReadCommitted',
      maxWait: 5000,
      timeout: 10000,
    },
  );
}
