import {
  Prisma,
  PrismaClient,
} from '@prisma/client';

import {
  isValidWazuhConnectorSecret,
  verifyWazuhConnectorSecret,
} from './wazuhConnectorCredentials';

import {
  evaluateIncidentAlert,
  IncidentIngestionMode,
} from './incidentProposalPolicy';

import {
  IncomingWazuhAlert,
  WazuhProposalConflictError,
} from './wazuhProposalIngestion';

export class WazuhTenantMismatchError extends Error {
  constructor() {
    super('Entreprise declaree incompatible avec le connecteur');
    this.name = 'WazuhTenantMismatchError';
  }
}

export class WazuhAuthenticatedRateLimitError extends Error {
  constructor() {
    super('Quota Wazuh authentifie depasse');
    this.name = 'WazuhAuthenticatedRateLimitError';
  }
}

export interface AuthenticatedWazuhIngestionResult {
  decision: 'MANUAL_ONLY' | 'PROPOSE';
  proposalId: string | null;
  duplicate: boolean;
}

function validId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 255 &&
    value.trim() === value
  );
}

function requiredText(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > maxLength
  ) {
    throw new Error(`Champ invalide : ${field}`);
  }

  return value.trim();
}

function validDescription(value: unknown): string | null {
  if (value === null || value === undefined) {
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

interface ValidatedAlert {
  externalEventId: string;
  eventTenantId?: string | null;
  title: string;
  description: string | null;
  severity: IncomingWazuhAlert['severity'];
}

function validateAlert(
  alert: IncomingWazuhAlert,
): ValidatedAlert {
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

  const description = validDescription(
    alert?.description,
  );

  if (
    alert?.eventTenantId !== undefined &&
    alert.eventTenantId !== null &&
    typeof alert.eventTenantId !== 'string'
  ) {
    throw new Error('Entreprise declaree invalide');
  }

  if (
    !['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
      .includes(alert?.severity)
  ) {
    throw new Error('Gravite invalide');
  }

  return {
    externalEventId,
    eventTenantId: alert.eventTenantId,
    title,
    description,
    severity: alert.severity,
  };
}

/**
 * Authentification ET ingestion dans une seule transaction.
 *
 * Ordre strict :
 * 1. Tenant FOR SHARE
 * 2. WazuhConnector FOR SHARE
 * 3. Verification du secret
 * 4. Politique d'ingestion
 * 5. Proposition et audit
 *
 * Les operations administratives prennent Tenant FOR UPDATE.
 * Elles ne peuvent donc pas revoquer le connecteur pendant
 * que cette transaction detient ses verrous.
 *
 * Aucune identite tenant/source n'est issue de l'alerte.
 *
 * null = authentification machine refusee.
 * Les erreurs de base de donnees restent des erreurs.
 */
export async function ingestAuthenticatedWazuhAlert(
  prisma: PrismaClient,
  connectorId: unknown,
  presentedSecret: unknown,
  incomingAlert: IncomingWazuhAlert,
  onAuthenticated?: () => boolean,
): Promise<AuthenticatedWazuhIngestionResult | null> {
  if (
    !validId(connectorId) ||
    !isValidWazuhConnectorSecret(presentedSecret)
  ) {
    return null;
  }

  const alert = validateAlert(incomingAlert);

  // Lecture de routage uniquement : aucune autorisation ici.
  const candidate = await prisma.wazuhConnector.findUnique({
    where: { id: connectorId },
    select: { tenantId: true },
  });

  if (!candidate) {
    return null;
  }

  /*
   * La contention sur une contrainte unique peut provoquer P2002.
   * En cas de collision, on recommence TOUTE la transaction,
   * authentification comprise.
   *
   * Aucun resultat de doublon n'est retourne apres une simple
   * lecture hors transaction.
   */
  // Une collision P2002 peut declencher plusieurs essais.
  // Le quota ne doit etre consomme qu'une fois par requete.
  let authenticatedQuotaConsumed = false;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        async tx => {
          const tenants = await tx.$queryRaw<
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
            WHERE "id" = ${candidate.tenantId}
              AND "isActive" = true
            FOR SHARE
          `;

          if (tenants.length !== 1) {
            return null;
          }

          const connectors = await tx.$queryRaw<
            Array<{
              id: string;
              tenantId: string;
              sourceId: string;
              secretHash: string;
            }>
          >`
            SELECT
              "id",
              "tenantId",
              "sourceId",
              "secretHash"
            FROM "WazuhConnector"
            WHERE "id" = ${connectorId}
              AND "tenantId" = ${candidate.tenantId}
              AND "isActive" = true
              AND "revokedAt" IS NULL
            FOR SHARE
          `;

          if (connectors.length !== 1) {
            return null;
          }

          const connector = connectors[0];

          if (
            !verifyWazuhConnectorSecret(
              presentedSecret,
              connector.secretHash,
            )
          ) {
            return null;
          }

          // Ne pas extraire cette autorisation de la
          // transaction : elle doit suivre la verification
          // du secret et preceder toute ecriture.
          if (
            onAuthenticated &&
            !authenticatedQuotaConsumed
          ) {
            if (!onAuthenticated()) {
              throw new WazuhAuthenticatedRateLimitError();
            }

            authenticatedQuotaConsumed = true;
          }

          if (
            alert.eventTenantId !== undefined &&
            alert.eventTenantId !== null &&
            alert.eventTenantId !== connector.tenantId
          ) {
            throw new WazuhTenantMismatchError();
          }

          const policy = evaluateIncidentAlert({
            connectorTenantId: connector.tenantId,
            eventTenantId: alert.eventTenantId,
            sourceId: connector.sourceId,
            externalEventId: alert.externalEventId,
            mode: tenants[0].incidentIngestionMode as IncidentIngestionMode,
            severity: alert.severity,
            automationApproved:
              tenants[0].automaticCreationApproved,
          });

          if (policy.decision === 'MANUAL_ONLY') {
            return {
              decision: 'MANUAL_ONLY',
              proposalId: null,
              duplicate: false,
            };
          }

          // V0.2 : validation humaine obligatoire,
          // y compris si la politique autorise l'automatisation.
          const decision = 'PROPOSE' as const;

          const key = {
            tenantId: connector.tenantId,
            sourceId: connector.sourceId,
            externalEventId: alert.externalEventId,
          };

          const existing =
            await tx.incidentProposal.findUnique({
              where: {
                tenantId_sourceId_externalEventId: key,
              },
            });

          if (existing) {
            if (
              existing.sourceType !== 'WAZUH' ||
              existing.title !== alert.title ||
              existing.description !== alert.description ||
              existing.severity !== alert.severity
            ) {
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
              title: alert.title,
              description: alert.description,
              severity: alert.severity,
              status: 'PENDING',
            },
            select: { id: true },
          });

          await tx.auditLog.create({
            data: {
              tenantId: connector.tenantId,
              action: 'CREATE',
              resource: 'INCIDENT_PROPOSAL',
              resourceId: created.id,
              metadata: {
                sourceType: 'WAZUH',
                sourceId: connector.sourceId,
                externalEventId: alert.externalEventId,
                ingestionDecision: policy.decision,
              },
            },
          });

          return {
            decision,
            proposalId: created.id,
            duplicate: false,
          };
        },
        {
          isolationLevel: 'ReadCommitted',
          maxWait: 5000,
          timeout: 10000,
        },
      );
    } catch (error) {
      const collision =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002';

      if (collision && attempt < 2) {
        continue;
      }

      throw error;
    }
  }

  throw new Error('Ingestion non terminee');
}
