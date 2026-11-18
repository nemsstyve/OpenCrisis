import type { PrismaClient } from '@prisma/client';
import {
  isValidWazuhConnectorSecret,
  verifyWazuhConnectorSecret,
} from './wazuhConnectorCredentials';

export interface AuthenticatedWazuhConnector {
  connectorId: string;
  tenantId: string;
  sourceId: string;
}

function validConnectorId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 255 &&
    value.trim() === value
  );
}

/**
 * Authentification machine distincte des JWT utilisateurs.
 *
 * Ne jamais faire confiance au tenantId/sourceId transmis
 * dans le corps d'une alerte.
 *
 * Les erreurs d'identifiants retournent null.
 * Les erreurs de base de donnees sont propagees : jamais
 * de repli vers une authentification permissive.
 */
export async function authenticateWazuhConnector(
  prisma: PrismaClient,
  connectorId: unknown,
  presentedSecret: unknown,
): Promise<AuthenticatedWazuhConnector | null> {
  if (
    !validConnectorId(connectorId) ||
    !isValidWazuhConnectorSecret(presentedSecret)
  ) {
    return null;
  }

  // Cette lecture sert uniquement a identifier la ligne
  // Tenant a verrouiller. Elle n'autorise rien.
  const candidate = await prisma.wazuhConnector.findUnique({
    where: { id: connectorId },
    select: { tenantId: true },
  });

  if (!candidate) {
    return null;
  }

  return prisma.$transaction(
    async tx => {
      // Ordre de verrouillage :
      // 1. Tenant
      // 2. WazuhConnector
      //
      // FOR SHARE autorise les autres authentifications
      // mais bloque les modifications concurrentes
      // des lignes concernees.
      const tenants = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "Tenant"
        WHERE "id" = ${candidate.tenantId}
          AND "isActive" = true
        FOR SHARE
      `;

      if (tenants.length !== 1) {
        return null;
      }

      // Relecture de l'identite APRES verrouillage.
      // Le tenant et la source sont immuables en base.
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

      // Ne retourner ni le secret ni son empreinte.
      return {
        connectorId: connector.id,
        tenantId: connector.tenantId,
        sourceId: connector.sourceId,
      };
    },
    {
      isolationLevel: 'ReadCommitted',
      maxWait: 5000,
      timeout: 10000,
    },
  );
}
