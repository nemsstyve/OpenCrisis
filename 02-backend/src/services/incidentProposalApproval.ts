import type { PrismaClient } from '@prisma/client';
import { assertProposalDecisionPermission } from './incidentProposalAuthorization';

/**
 * Validation humaine d'une proposition d'incident.
 *
 * Service interne : ne pas exposer directement en HTTP
 * ou GraphQL sans authentification et RBAC.
 *
 * Le tenant et l'identite du validateur doivent provenir
 * exclusivement du contexte authentifie cote serveur.
 */

export class IncidentProposalApprovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IncidentProposalApprovalError';
  }
}

export interface IncidentProposalApprovalRequest {
  proposalId: string;
  tenantId: string;
  reviewerId: string;
}

export async function approveIncidentProposal(
  prisma: PrismaClient,
  request: IncidentProposalApprovalRequest,
): Promise<{ proposalId: string; incidentId: string }> {
  if (
    !request.proposalId?.trim() ||
    !request.tenantId?.trim() ||
    !request.reviewerId?.trim()
  ) {
    throw new IncidentProposalApprovalError(
      'Identifiants de validation invalides',
    );
  }

  return prisma.$transaction(
    async (tx) => {
      // Revérification de l'utilisateur et du tenant
      // au moment effectif de la validation.
      // Le verrou tenant et le RBAC sont controles avant toute
      // autre lecture de cette transaction Serializable.
      await assertProposalDecisionPermission(
        tx,
        request.reviewerId,
        request.tenantId,
      );

      const reviewer = await tx.user.findFirst({
        where: {
          id: request.reviewerId,
          tenantId: request.tenantId,
          isActive: true,
          deletedAt: null,
          mustChangePassword: false,
          tenant: { isActive: true },
        },
        select: { id: true },
      });

      if (!reviewer) {
        throw new IncidentProposalApprovalError(
          'Validateur non autorise',
        );
      }

      const proposal = await tx.incidentProposal.findFirst({
        where: {
          id: request.proposalId,
          tenantId: request.tenantId,
          status: 'PENDING',
        },
      });

      if (!proposal) {
        throw new IncidentProposalApprovalError(
          'Proposition indisponible ou deja traitee',
        );
      }

      // Transition conditionnelle : une seule transaction
      // peut revendiquer une proposition PENDING.
      const claimed = await tx.incidentProposal.updateMany({
        where: {
          id: proposal.id,
          tenantId: request.tenantId,
          status: 'PENDING',
        },
        data: {
          status: 'APPROVED',
          reviewedById: reviewer.id,
          reviewedAt: new Date(),
        },
      });

      if (claimed.count !== 1) {
        throw new IncidentProposalApprovalError(
          'Proposition deja prise en charge',
        );
      }

      const incident = await tx.incident.create({
        data: {
          tenantId: request.tenantId,
          createdById: reviewer.id,
          name: proposal.title,
          description: proposal.description,
          severity: proposal.severity,
          status: 'ACTIVE',
        },
        select: { id: true },
      });

      const converted = await tx.incidentProposal.updateMany({
        where: {
          id: proposal.id,
          tenantId: request.tenantId,
          status: 'APPROVED',
          reviewedById: reviewer.id,
          incidentId: null,
        },
        data: {
          status: 'CONVERTED',
          incidentId: incident.id,
        },
      });

      if (converted.count !== 1) {
        throw new IncidentProposalApprovalError(
          'Conversion de proposition impossible',
        );
      }

      // L'audit participe a la meme transaction :
      // son echec annule la creation de l'incident.
      await tx.auditLog.create({
        data: {
          tenantId: request.tenantId,
          userId: reviewer.id,
          incidentId: incident.id,
          action: 'CREATE_FROM_PROPOSAL',
          resource: 'INCIDENT',
          resourceId: incident.id,
          metadata: {
            proposalId: proposal.id,
            sourceType: proposal.sourceType,
            sourceId: proposal.sourceId,
            externalEventId: proposal.externalEventId,
          },
        },
      });

      return {
        proposalId: proposal.id,
        incidentId: incident.id,
      };
    },
    {
      isolationLevel: 'ReadCommitted',
      maxWait: 5000,
      timeout: 10000,
    },
  );
}
