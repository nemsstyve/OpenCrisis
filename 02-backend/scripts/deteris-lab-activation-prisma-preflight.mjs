import {
  inspectLabActivationReadiness,
} from './deteris-lab-activation-preflight.mjs';

export class LabPrismaPreflightError extends Error {
  constructor(code) {
    super(code);
    this.name = 'LabPrismaPreflightError';
    this.code = code;
  }
}

function refuse(code) {
  throw new LabPrismaPreflightError(code);
}

/**
 * Lecture transactionnelle du tenant Deteris.
 *
 * - Aucun PrismaClient instancie.
 * - Aucune connexion automatique.
 * - Transaction PostgreSQL READ ONLY.
 * - Aucun hash retourne ou affiche.
 * - Aucune activation ni ecriture.
 */
export async function inspectLabActivationFromPrisma(
  adapter,
  { permit = false } = {},
) {
  if (permit !== true) {
    refuse('PREFLIGHT_NOT_AUTHORIZED');
  }

  if (!adapter || typeof adapter.$transaction !== 'function') {
    refuse('INVALID_PRISMA_ADAPTER');
  }

  return adapter.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');

    const initial = await tx.tenant.findUnique({
      where: { slug: 'opencrisis-initial' },
      select: {
        id: true,
        slug: true,
        isActive: true,
      },
    });

    const lab = await tx.tenant.findUnique({
      where: { slug: 'deteris-r2d-lab' },
      select: {
        id: true,
        slug: true,
        isActive: true,
        incidentIngestionMode: true,
        automaticCreationApproved: true,
      },
    });

    if (!initial?.id || !lab?.id) {
      refuse('REQUIRED_TENANT_MISSING');
    }

    const roles = await tx.role.findMany({
      where: { tenantId: lab.id },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
    });

    const users = await tx.user.findMany({
      where: { tenantId: lab.id },
      select: {
        id: true,
        tenantId: true,
        email: true,
        passwordHash: true,
        isActive: true,
        mustChangePassword: true,
        sessionVersion: true,
        roleAssignments: {
          select: { roleId: true },
        },
      },
    });

    if (roles.length !== 1 || users.length !== 2) {
      refuse('LAB_INVENTORY_UNEXPECTED');
    }

    const bootstrap = users.find(
      user =>
        user.email === 'bootstrap@deteris-r2d.invalid'
    );

    const humans = users.filter(
      user =>
        user.email !== 'bootstrap@deteris-r2d.invalid'
    );

    if (!bootstrap || humans.length !== 1) {
      refuse('LAB_IDENTITY_INVENTORY_INVALID');
    }

    const administrator = humans[0];
    const role = roles[0];

    const [
      assignments,
      sessions,
      refreshTokens,
      connectors,
      incidents,
    ] = await Promise.all([
      tx.roleAssignment.count({
        where: { user: { tenantId: lab.id } },
      }),
      tx.authSession.count({
        where: { user: { tenantId: lab.id } },
      }),
      tx.refreshToken.count({
        where: { user: { tenantId: lab.id } },
      }),
      tx.wazuhConnector.count({
        where: { tenantId: lab.id },
      }),
      tx.incident.count({
        where: { tenantId: lab.id },
      }),
    ]);

    const snapshot = {
      initial,
      lab,
      role: {
        id: role.id,
        tenantId: role.tenantId,
        name: role.name,
        isSystem: role.isSystem,
        permissions: role.permissions.map(
          item =>
            `${item.permission.resource}:${item.permission.action}`
        ),
      },
      bootstrap: {
        tenantId: bootstrap.tenantId,
        email: bootstrap.email,
        isActive: bootstrap.isActive,
        passwordHash: bootstrap.passwordHash,
        roleIds: bootstrap.roleAssignments.map(
          item => item.roleId
        ),
      },
      administrator: {
        id: administrator.id,
        tenantId: administrator.tenantId,
        email: administrator.email,
        isActive: administrator.isActive,
        mustChangePassword: administrator.mustChangePassword,
        sessionVersion: administrator.sessionVersion,
        passwordHash: administrator.passwordHash,
        roleIds: administrator.roleAssignments.map(
          item => item.roleId
        ),
      },
      counts: {
        labUsers: users.length,
        labRoles: roles.length,
        labRoleAssignments: assignments,
        labSessions: sessions,
        labRefreshTokens: refreshTokens,
        labConnectors: connectors,
        labIncidents: incidents,
      },
    };

    const result = inspectLabActivationReadiness(snapshot);

    // Seul le diagnostic sort de la transaction.
    // Les hash restent dans la portee locale.
    return Object.freeze({
      ...result,
      source: 'POSTGRESQL_READ_ONLY',
    });
  }, {
    isolationLevel: 'Serializable',
    maxWait: 5000,
    timeout: 10000,
  });
}
