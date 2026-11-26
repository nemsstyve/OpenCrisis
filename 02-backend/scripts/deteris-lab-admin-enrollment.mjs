/**
 * Enrolement initial d'un administrateur humain.
 *
 * Module non deploye, sans point d'entree.
 * Aucun mot de passe genere.
 * Aucun compte active.
 * Aucune connexion automatique a PostgreSQL.
 */

export class LabEnrollmentError extends Error {
  constructor(code) {
    super(code);
    this.name = 'LabEnrollmentError';
    this.code = code;
  }
}

function refuse(code) {
  throw new LabEnrollmentError(code);
}

const LAB_SLUG = 'deteris-r2d-lab';
const INITIAL_SLUG = 'opencrisis-initial';
const ROLE_NAME = 'Deteris Lab Administrateur';
const BOOTSTRAP_EMAIL = 'bootstrap@deteris-r2d.invalid';
const DISABLED_HASH = '!DISABLED_BOOTSTRAP_NO_PASSWORD!';

const EXPECTED_PERMISSIONS = [
  'ADMIN:READ',
  'ADMIN:WRITE',
  'DASHBOARD:READ',
  'DASHBOARD:WRITE',
];

export async function enrollInactiveLabAdministrator(
  adapter,
  {
    permit = false,
    email,
    firstName,
    lastName,
  } = {},
) {
  if (permit !== true) {
    refuse('ENROLLMENT_NOT_AUTHORIZED');
  }

  if (!adapter || typeof adapter.$transaction !== 'function') {
    refuse('INVALID_PRISMA_ADAPTER');
  }

  if (
    typeof email !== 'string' ||
    email.length > 254 ||
    email !== email.trim().toLowerCase() ||
    !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email) ||
    email.endsWith('.invalid') ||
    email === 'admin@opencrisis.local'
  ) {
    refuse('INVALID_ADMIN_EMAIL');
  }

  for (const value of [firstName, lastName]) {
    if (
      typeof value !== 'string' ||
      value.trim() !== value ||
      value.length < 1 ||
      value.length > 100
    ) {
      refuse('INVALID_ADMIN_IDENTITY');
    }
  }

  return adapter.$transaction(async tx => {
    const initial = await tx.tenant.findUnique({
      where: { slug: INITIAL_SLUG },
      select: { id: true, isActive: true },
    });

    const lab = await tx.tenant.findUnique({
      where: { slug: LAB_SLUG },
      select: {
        id: true,
        isActive: true,
        incidentIngestionMode: true,
        automaticCreationApproved: true,
      },
    });

    if (!initial?.id || initial.isActive !== true) {
      refuse('INITIAL_TENANT_NOT_VERIFIED');
    }

    if (
      !lab?.id ||
      lab.id === initial.id ||
      lab.isActive !== false ||
      lab.incidentIngestionMode !== 'SEMI_AUTOMATIC' ||
      lab.automaticCreationApproved !== false
    ) {
      refuse('INACTIVE_LAB_NOT_VERIFIED');
    }

    const role = await tx.role.findFirst({
      where: {
        name: ROLE_NAME,
        tenantId: lab.id,
        isSystem: false,
      },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
    });

    if (!role?.id) {
      refuse('DEDICATED_ROLE_NOT_FOUND');
    }

    const permissions = role.permissions
      .map(item =>
        `${item.permission.resource}:${item.permission.action}`
      )
      .sort();

    if (
      JSON.stringify(permissions) !==
      JSON.stringify(EXPECTED_PERMISSIONS)
    ) {
      refuse('DEDICATED_ROLE_PERMISSIONS_INVALID');
    }

    const bootstrap = await tx.user.findUnique({
      where: { email: BOOTSTRAP_EMAIL },
      select: {
        id: true,
        tenantId: true,
        isActive: true,
        passwordHash: true,
        roleAssignments: {
          select: { roleId: true },
        },
      },
    });

    if (
      !bootstrap?.id ||
      bootstrap.tenantId !== lab.id ||
      bootstrap.isActive !== false ||
      bootstrap.passwordHash !== DISABLED_HASH ||
      bootstrap.roleAssignments.length !== 1 ||
      bootstrap.roleAssignments[0].roleId !== role.id
    ) {
      refuse('BOOTSTRAP_ACCOUNT_NOT_VERIFIED');
    }

    const userCount = await tx.user.count({
      where: { tenantId: lab.id },
    });

    if (userCount !== 1) {
      refuse('LAB_ENROLLMENT_ALREADY_INITIALIZED');
    }

    const existing = await tx.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existing !== null) {
      refuse('ADMIN_EMAIL_ALREADY_USED');
    }

    const created = await tx.user.create({
      data: {
        email,
        firstName,
        lastName,
        tenantId: lab.id,
        passwordHash: DISABLED_HASH,
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
      !created?.id ||
      created.tenantId !== lab.id ||
      created.isActive !== false ||
      created.mustChangePassword !== true ||
      created.sessionVersion !== 0
    ) {
      refuse('ENROLLED_ACCOUNT_INVALID');
    }

    const audit = await tx.auditLog.create({
      data: {
        tenantId: lab.id,
        userId: null,
        resource: 'ADMIN',
        action: 'CREATE',
        resourceId: created.id,
        metadata: {
          operation: 'DETERIS_LAB_ADMIN_ENROLLMENT',
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
      refuse('ENROLLMENT_AUDIT_FAILED');
    }

    return Object.freeze({
      status: 'ADMIN_ENROLLED_DISABLED',
      tenantId: lab.id,
      accountId: created.id,
      auditId: audit.id,
      accountActive: false,
      tenantActive: false,
      activationAllowed: false,
    });
  }, {
    isolationLevel: 'Serializable',
    maxWait: 5000,
    timeout: 10000,
  });
}
