import {
  Prisma,
  PrismaClient,
} from '@prisma/client';

import {
  generateWazuhConnectorSecret,
  hashWazuhConnectorSecret,
} from './wazuhConnectorCredentials';

export interface WazuhConnectorAdminContext {
  tenantId: string;
  actorUserId: string;
}

export interface CreateWazuhConnectorInput {
  name: string;
  sourceId: string;
}

export interface WazuhConnectorSecretResult {
  connectorId: string;
  tenantId: string;
  sourceId: string;
  secret: string;
}

function requiredText(
  value: unknown,
  field: string,
  maximum: number,
): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value !== value.trim() ||
    value.length > maximum ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error(`Champ invalide : ${field}`);
  }

  return value;
}

/**
 * Meme ordre de verrouillage que les autres services :
 *
 * 1. Tenant FOR UPDATE
 * 2. verification ADMIN:WRITE
 * 3. modification du connecteur
 * 4. audit dans la meme transaction
 *
 * tenantId et actorUserId doivent provenir exclusivement
 * de la session utilisateur authentifiee.
 */
async function assertConnectorAdministrator(
  tx: Prisma.TransactionClient,
  context: WazuhConnectorAdminContext,
): Promise<void> {
  const tenants = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "Tenant"
    WHERE "id" = ${context.tenantId}
      AND "isActive" = true
    FOR UPDATE
  `;

  if (tenants.length !== 1) {
    throw new Error('Entreprise non autorisee');
  }

  const actor = await tx.user.findFirst({
    where: {
      id: context.actorUserId,
      tenantId: context.tenantId,
      deletedAt: null,
      isActive: true,
      mustChangePassword: false,
    },
    select: { id: true },
  });

  if (!actor) {
    throw new Error('Administrateur non autorise');
  }

  const permission = await tx.roleAssignment.findFirst({
    where: {
      userId: actor.id,
      role: {
        is: {
          OR: [
            { tenantId: null, isSystem: true },
            {
              tenantId: context.tenantId,
              isSystem: false,
            },
          ],
          permissions: {
            some: {
              permission: {
                resource: 'ADMIN',
                action: 'WRITE',
              },
            },
          },
        },
      },
    },
    select: { id: true },
  });

  if (!permission) {
    throw new Error('Permission ADMIN:WRITE requise');
  }
}

function validatedContext(
  context: WazuhConnectorAdminContext,
): WazuhConnectorAdminContext {
  return {
    tenantId: requiredText(
      context?.tenantId, 'tenantId', 255,
    ),
    actorUserId: requiredText(
      context?.actorUserId, 'actorUserId', 255,
    ),
  };
}

function validatedConnectorId(value: unknown): string {
  return requiredText(value, 'connectorId', 255);
}

/**
 * CREATION
 *
 * Secret retourne une seule fois a l'appelant habilite.
 * Seule son empreinte est persistante.
 */
export async function createWazuhConnector(
  prisma: PrismaClient,
  contextInput: WazuhConnectorAdminContext,
  input: CreateWazuhConnectorInput,
): Promise<WazuhConnectorSecretResult> {
  const context = validatedContext(contextInput);

  const name = requiredText(input?.name, 'name', 120);
  const sourceId = requiredText(
    input?.sourceId, 'sourceId', 255,
  );

  const secret = generateWazuhConnectorSecret();
  const secretHash = hashWazuhConnectorSecret(secret);

  return prisma.$transaction(
    async tx => {
      await assertConnectorAdministrator(tx, context);

      const connector = await tx.wazuhConnector.create({
        data: {
          tenantId: context.tenantId,
          name,
          sourceId,
          secretHash,
        },
        select: {
          id: true,
          tenantId: true,
          sourceId: true,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: context.tenantId,
          userId: context.actorUserId,
          action: 'CREATE',
          resource: 'WAZUH_CONNECTOR',
          resourceId: connector.id,
          metadata: {
            target: 'wazuh_connector_create',
            sourceId: connector.sourceId,
          },
        },
      });

      // Le secret ne sort qu'apres le COMMIT reussi.
      return {
        connectorId: connector.id,
        tenantId: connector.tenantId,
        sourceId: connector.sourceId,
        secret,
      };
    },
    {
      isolationLevel: 'ReadCommitted',
      maxWait: 5000,
      timeout: 10000,
    },
  );
}

/**
 * ROTATION
 *
 * L'empreinte precedente est remplacee atomiquement.
 * Un connecteur revoque ne peut pas etre restaure.
 */
export async function rotateWazuhConnectorSecret(
  prisma: PrismaClient,
  contextInput: WazuhConnectorAdminContext,
  connectorIdInput: string,
): Promise<WazuhConnectorSecretResult> {
  const context = validatedContext(contextInput);
  const connectorId = validatedConnectorId(connectorIdInput);

  const secret = generateWazuhConnectorSecret();
  const secretHash = hashWazuhConnectorSecret(secret);

  return prisma.$transaction(
    async tx => {
      await assertConnectorAdministrator(tx, context);

      const existing = await tx.wazuhConnector.findFirst({
        where: {
          id: connectorId,
          tenantId: context.tenantId,
          isActive: true,
          revokedAt: null,
        },
        select: { id: true, sourceId: true },
      });

      if (!existing) {
        throw new Error('Connecteur introuvable ou inactif');
      }

      const changed = await tx.wazuhConnector.updateMany({
        where: {
          id: connectorId,
          tenantId: context.tenantId,
          isActive: true,
          revokedAt: null,
        },
        data: { secretHash },
      });

      if (changed.count !== 1) {
        throw new Error('Rotation non autorisee');
      }

      await tx.auditLog.create({
        data: {
          tenantId: context.tenantId,
          userId: context.actorUserId,
          action: 'UPDATE',
          resource: 'WAZUH_CONNECTOR',
          resourceId: connectorId,
          metadata: {
            target: 'wazuh_connector_rotate',
            sourceId: existing.sourceId,
          },
        },
      });

      return {
        connectorId,
        tenantId: context.tenantId,
        sourceId: existing.sourceId,
        secret,
      };
    },
    {
      isolationLevel: 'ReadCommitted',
      maxWait: 5000,
      timeout: 10000,
    },
  );
}

/**
 * REVOCATION
 *
 * Un connecteur revoque reste en base pour preserver
 * son identite et l'historique de ses alertes.
 */
export async function revokeWazuhConnector(
  prisma: PrismaClient,
  contextInput: WazuhConnectorAdminContext,
  connectorIdInput: string,
): Promise<{ connectorId: string; revoked: true }> {
  const context = validatedContext(contextInput);
  const connectorId = validatedConnectorId(connectorIdInput);

  return prisma.$transaction(
    async tx => {
      await assertConnectorAdministrator(tx, context);

      const connector = await tx.wazuhConnector.findFirst({
        where: {
          id: connectorId,
          tenantId: context.tenantId,
          isActive: true,
          revokedAt: null,
        },
        select: { id: true, sourceId: true },
      });

      if (!connector) {
        throw new Error('Connecteur introuvable ou deja revoque');
      }

      const changed = await tx.wazuhConnector.updateMany({
        where: {
          id: connectorId,
          tenantId: context.tenantId,
          isActive: true,
          revokedAt: null,
        },
        data: {
          isActive: false,
          revokedAt: new Date(),
        },
      });

      if (changed.count !== 1) {
        throw new Error('Revocation non autorisee');
      }

      await tx.auditLog.create({
        data: {
          tenantId: context.tenantId,
          userId: context.actorUserId,
          action: 'REVOKE',
          resource: 'WAZUH_CONNECTOR',
          resourceId: connectorId,
          metadata: {
            target: 'wazuh_connector_revoke',
            sourceId: connector.sourceId,
          },
        },
      });

      return {
        connectorId,
        revoked: true as const,
      };
    },
    {
      isolationLevel: 'ReadCommitted',
      maxWait: 5000,
      timeout: 10000,
    },
  );
}
