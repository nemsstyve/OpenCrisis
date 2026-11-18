import {
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { evaluateIncidentAlert } from './incidentProposalPolicy';

/**
 * Identite obtenue par un mecanisme d'authentification
 * du connecteur, a construire separement.
 *
 * Ne jamais construire cet objet avec les champs
 * tenantId ou sourceId du corps HTTP entrant.
 */
export interface TrustedWazuhConnector {
  tenantId: string;
  sourceId: string;
}

export interface IncomingWazuhAlert {
  externalEventId: string;
  eventTenantId?: string | null;
  title: string;
  description?: string | null;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

function requiredText(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > maxLength
  ) {
    throw new Error(`Champ invalide : ${field}`);
  }

  return value.trim();
}

function optionalDescription(
  value: unknown,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (
    typeof value !== 'string' ||
    value.length > 4000
  ) {
    throw new Error('Description invalide');
  }

  return value.trim() || null;
}

export class WazuhProposalConflictError extends Error {
  constructor() {
    super('Conflit avec un evenement deja recu');
    this.name = 'WazuhProposalConflictError';
  }
}

/**
 * L'identite du connecteur est une entree de confiance.
 * Aucune route HTTP publique ne doit appeler ce service
 * avant la mise en place de cette authentification.
 */
export async function ingestWazuhProposal(
  prisma: PrismaClient,
  connector: TrustedWazuhConnector,
  alert: IncomingWazuhAlert,
) {
  const tenantId = requiredText(
    connector?.tenantId,
    'connector.tenantId',
    255,
  );

  const sourceId = requiredText(
    connector?.sourceId,
    'connector.sourceId',
    255,
  );

  const externalEventId = requiredText(
    alert?.externalEventId,
    'externalEventId',
    255,
  );

  const title = requiredText(
    alert?.title,
    'title',
    255,
  );

  const description = optionalDescription(
    alert?.description,
  );

  // Validation du champ eventTenantId et de severity
  // par la politique existante avant toute ecriture.
  if (
    alert.eventTenantId !== undefined &&
    alert.eventTenantId !== null &&
    typeof alert.eventTenantId !== 'string'
  ) {
    throw new Error('Entreprise declaree invalide');
  }

  if (
    alert.eventTenantId !== undefined &&
    alert.eventTenantId !== null &&
    alert.eventTenantId !== tenantId
  ) {
    throw new Error('Alerte refusee : incoherence inter-tenant');
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      isActive: true,
      incidentIngestionMode: true,
      automaticCreationApproved: true,
    },
  });

  if (!tenant?.isActive) {
    throw new Error('Entreprise inactive ou introuvable');
  }

  const policy = evaluateIncidentAlert({
    connectorTenantId: tenantId,
    eventTenantId: alert.eventTenantId,
    sourceId,
    externalEventId,
    mode: tenant.incidentIngestionMode,
    severity: alert.severity,
    automationApproved: tenant.automaticCreationApproved,
  });

  if (policy.decision === 'MANUAL_ONLY') {
    return {
      decision: 'MANUAL_ONLY' as const,
      proposalId: null,
      duplicate: false,
    };
  }

  // V0.2 : meme une alerte admissible en automatique
  // reste soumise a une validation humaine.
  const decision = 'PROPOSE' as const;

  const key = {
    tenantId,
    sourceId,
    externalEventId,
  };

  const matchingPayload = (existing: {
    sourceType: string;
    title: string;
    description: string | null;
    severity: string;
  }) => (
    existing.sourceType === 'WAZUH' &&
    existing.title === title &&
    existing.description === description &&
    existing.severity === alert.severity
  );

  const findExisting = () =>
    prisma.incidentProposal.findUnique({
      where: {
        tenantId_sourceId_externalEventId: key,
      },
    });

  // Le controle d'etat de l'entreprise est repete
  // dans la transaction avant toute insertion.
  try {
    return await prisma.$transaction(async tx => {
      const tenantRows = await tx.$queryRaw<
        Array<{
          id: string;
          incidentIngestionMode: string;
          automaticCreationApproved: boolean;
        }>
      >`
        SELECT
          "id",
          "incidentIngestionMode",
          "automaticCreationApproved"
        FROM "Tenant"
        WHERE "id" = ${tenantId}
          AND "isActive" = true
        FOR SHARE
      `;

      if (tenantRows.length !== 1) {
        throw new Error('Entreprise non autorisee');
      }

      const currentPolicy = evaluateIncidentAlert({
        connectorTenantId: tenantId,
        eventTenantId: alert.eventTenantId,
        sourceId,
        externalEventId,
        mode: tenantRows[0].incidentIngestionMode as
          'MANUAL' | 'SEMI_AUTOMATIC' | 'AUTOMATIC',
        severity: alert.severity,
        automationApproved:
          tenantRows[0].automaticCreationApproved,
      });

      if (currentPolicy.decision === 'MANUAL_ONLY') {
        return {
          decision: 'MANUAL_ONLY' as const,
          proposalId: null,
          duplicate: false,
        };
      }

      const existing = await tx.incidentProposal.findUnique({
        where: {
          tenantId_sourceId_externalEventId: key,
        },
      });

      if (existing) {
        if (!matchingPayload(existing)) {
          throw new WazuhProposalConflictError();
        }

        return {
          decision,
          proposalId: existing.id,
          duplicate: true,
        };
      }

      const created = await tx.incidentProposal.create({
        data: {
          ...key,
          sourceType: 'WAZUH',
          title,
          description,
          severity: alert.severity,
          status: 'PENDING',
        },
        select: { id: true },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          action: 'CREATE',
          resource: 'INCIDENT_PROPOSAL',
          resourceId: created.id,
          metadata: {
            sourceType: 'WAZUH',
            sourceId,
            externalEventId,
            ingestionDecision: currentPolicy.decision,
          },
        },
      });

      return {
        decision,
        proposalId: created.id,
        duplicate: false,
      };
    }, {
      isolationLevel: 'ReadCommitted',
      maxWait: 5000,
      timeout: 10000,
    });
  } catch (error) {
    // Une collision d'unicite peut provenir de deux
    // livraisons simultanees du meme evenement.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const existing = await findExisting();

      if (existing && matchingPayload(existing)) {
        return {
          decision,
          proposalId: existing.id,
          duplicate: true,
        };
      }

      if (existing) {
        throw new WazuhProposalConflictError();
      }
    }

    throw error;
  }
}
