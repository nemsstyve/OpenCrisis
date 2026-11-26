/**
 * Bootstrap administratif Deteris-R2D Lab.
 *
 * Module non deploye.
 * Aucun PrismaClient instancie.
 * Aucun point d'entree CLI.
 * Aucun mot de passe genere ou exploitable.
 *
 * Cree uniquement :
 * - un role propre au tenant inactif ;
 * - ses deux permissions administratives ;
 * - un compte technique DESACTIVE ;
 * - une attribution de role ;
 * - un enregistrement d'audit.
 *
 * Le compte technique ne doit jamais etre active.
 * Un vrai administrateur fera l'objet d'une procedure
 * d'enrolement separee.
 */

export class LabAdminBootstrapError extends Error {
  constructor(code) {
    super(code);
    this.name = 'LabAdminBootstrapError';
    this.code = code;
  }
}

const LAB_SLUG = 'deteris-r2d-lab';
const INITIAL_SLUG = 'opencrisis-initial';

const ROLE_NAME = 'Deteris Lab Administrateur';
const ACCOUNT_EMAIL = 'bootstrap@deteris-r2d.invalid';

const DISABLED_HASH = '!DISABLED_BOOTSTRAP_NO_PASSWORD!';

function reject(code) {
  throw new LabAdminBootstrapError(code);
}

export async function bootstrapInactiveLabAdmin(
  adapter,
  { permit = false } = {},
) {
  if (permit !== true) {
    reject('BOOTSTRAP_NOT_AUTHORIZED');
  }

  if (
    !adapter ||
    typeof adapter.$transaction !== 'function'
  ) {
    reject('INVALID_PRISMA_ADAPTER');
  }

  return adapter.$transaction(async tx => {
    const initial = await tx.tenant.findUnique({
      where: { slug: INITIAL_SLUG },
      select: { id: true, isActive: true },
    });

    if (!initial?.id || initial.isActive !== true) {
      reject('INITIAL_TENANT_NOT_VERIFIED');
    }

    const lab = await tx.tenant.findUnique({
      where: { slug: LAB_SLUG },
      select: {
        id: true,
        isActive: true,
        incidentIngestionMode: true,
        automaticCreationApproved: true,
      },
    });

    if (
      !lab?.id ||
      lab.id === initial.id ||
      lab.isActive !== false ||
      lab.incidentIngestionMode !== 'SEMI_AUTOMATIC' ||
      lab.automaticCreationApproved !== false
    ) {
      reject('INACTIVE_LAB_NOT_VERIFIED');
    }

    const [existingUsers, existingRoles, existingEmail] =
      await Promise.all([
        tx.user.count({
          where: { tenantId: lab.id },
        }),
        tx.role.count({
          where: { tenantId: lab.id },
        }),
        tx.user.findUnique({
          where: { email: ACCOUNT_EMAIL },
          select: { id: true },
        }),
      ]);

    if (
      existingUsers !== 0 ||
      existingRoles !== 0 ||
      existingEmail !== null
    ) {
      reject('LAB_BOOTSTRAP_ALREADY_INITIALIZED');
    }

    const required = [
      ['ADMIN', 'READ'],
      ['ADMIN', 'WRITE'],
      ['DASHBOARD', 'READ'],
      ['DASHBOARD', 'WRITE'],
    ];

    const permissions = [];

    for (const [resource, action] of required) {
      const permission = await tx.permission.findUnique({
        where: {
          resource_action: { resource, action },
        },
        select: {
          id: true,
          resource: true,
          action: true,
        },
      });

      if (
        !permission?.id ||
        permission.resource !== resource ||
        permission.action !== action
      ) {
        reject('LAB_PERMISSION_MISSING');
      }

      permissions.push(permission);
    }

    const role = await tx.role.create({
      data: {
        name: ROLE_NAME,
        tenantId: lab.id,
        isSystem: false,
        permissions: {
          create: permissions.map(permission => ({
            permissionId: permission.id,
          })),
        },
      },
      select: {
        id: true,
        tenantId: true,
        isSystem: true,
      },
    });

    if (
      !role?.id ||
      role.tenantId !== lab.id ||
      role.isSystem !== false
    ) {
      reject('LAB_ROLE_POSTCONDITION_FAILED');
    }

    const account = await tx.user.create({
      data: {
        email: ACCOUNT_EMAIL,
        tenantId: lab.id,
        passwordHash: DISABLED_HASH,
        firstName: 'Bootstrap',
        lastName: 'Deteris Lab',
        isActive: false,
        mustChangePassword: true,
        sessionVersion: 0,
        roleAssignments: {
          create: [{ roleId: role.id }],
        },
      },
      select: {
        id: true,
        tenantId: true,
        isActive: true,
        mustChangePassword: true,
        sessionVersion: true,
      },
    });

    if (
      !account?.id ||
      account.tenantId !== lab.id ||
      account.isActive !== false ||
      account.mustChangePassword !== true ||
      account.sessionVersion !== 0
    ) {
      reject('LAB_ACCOUNT_POSTCONDITION_FAILED');
    }

    const audit = await tx.auditLog.create({
      data: {
        tenantId: lab.id,
        userId: null,
        action: 'CREATE',
        resource: 'ADMIN',
        resourceId: account.id,
        metadata: {
          operation: 'DETERIS_LAB_BOOTSTRAP',
          accountStatus: 'DISABLED',
          roleScope: 'TENANT_ONLY',
          activationAllowed: false,
        },
      },
      select: {
        id: true,
        tenantId: true,
      },
    });

    if (!audit?.id || audit.tenantId !== lab.id) {
      reject('LAB_AUDIT_POSTCONDITION_FAILED');
    }

    return Object.freeze({
      status: 'INACTIVE_ADMIN_BOOTSTRAPPED',
      tenantId: lab.id,
      roleId: role.id,
      accountId: account.id,
      accountActive: false,
      tenantActive: false,
      roleSystem: false,
      auditId: audit.id,
      activationAllowed: false,
    });
  }, {
    isolationLevel: 'Serializable',
    maxWait: 5000,
    timeout: 10000,
  });
}
