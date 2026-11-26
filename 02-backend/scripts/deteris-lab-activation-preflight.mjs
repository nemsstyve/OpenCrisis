/**
 * Controle prealable a l'activation Deteris-R2D.
 *
 * Fonction pure : aucune connexion DB, aucune mutation.
 * Une validation positive ne constitue PAS une
 * autorisation de deployer ni d'activer le tenant.
 */

export class LabActivationError extends Error {
  constructor(code) {
    super(code);
    this.name = 'LabActivationError';
    this.code = code;
  }
}

function refuse(code) {
  throw new LabActivationError(code);
}

const REQUIRED = [
  'ADMIN:READ',
  'ADMIN:WRITE',
  'DASHBOARD:READ',
  'DASHBOARD:WRITE',
];

const DISABLED_HASH = '!DISABLED_BOOTSTRAP_NO_PASSWORD!';

function validBcryptHash(value) {
  return (
    typeof value === 'string' &&
    /^\$2[aby]\$12\$[./A-Za-z0-9]{53}$/.test(value)
  );
}

export function inspectLabActivationReadiness(snapshot) {
  if (
    !snapshot ||
    typeof snapshot !== 'object' ||
    Array.isArray(snapshot)
  ) {
    refuse('INVALID_ACTIVATION_SNAPSHOT');
  }

  const {
    initial,
    lab,
    role,
    bootstrap,
    administrator,
    counts,
  } = snapshot;

  if (
    !initial?.id ||
    initial.slug !== 'opencrisis-initial' ||
    initial.isActive !== true
  ) {
    refuse('INITIAL_TENANT_NOT_VERIFIED');
  }

  if (
    !lab?.id ||
    lab.id === initial.id ||
    lab.slug !== 'deteris-r2d-lab' ||
    lab.isActive !== false ||
    lab.incidentIngestionMode !== 'SEMI_AUTOMATIC' ||
    lab.automaticCreationApproved !== false
  ) {
    refuse('LAB_INACTIVE_STATE_INVALID');
  }

  if (
    !role?.id ||
    role.tenantId !== lab.id ||
    role.name !== 'Deteris Lab Administrateur' ||
    role.isSystem !== false ||
    !Array.isArray(role.permissions) ||
    JSON.stringify([...role.permissions].sort()) !==
      JSON.stringify(REQUIRED)
  ) {
    refuse('LAB_ADMIN_ROLE_INVALID');
  }

  if (
    bootstrap?.tenantId !== lab.id ||
    bootstrap.email !== 'bootstrap@deteris-r2d.invalid' ||
    bootstrap.isActive !== false ||
    bootstrap.passwordHash !== DISABLED_HASH ||
    !Array.isArray(bootstrap.roleIds) ||
    bootstrap.roleIds.length !== 1 ||
    bootstrap.roleIds[0] !== role.id
  ) {
    refuse('BOOTSTRAP_ACCOUNT_UNSAFE');
  }

  if (
    !administrator?.id ||
    administrator.tenantId !== lab.id ||
    typeof administrator.email !== 'string' ||
    administrator.email.endsWith('.invalid') ||
    administrator.email === bootstrap.email ||
    administrator.isActive !== false ||
    administrator.mustChangePassword !== true ||
    administrator.sessionVersion !== 0 ||
    !Array.isArray(administrator.roleIds) ||
    administrator.roleIds.length !== 1 ||
    administrator.roleIds[0] !== role.id
  ) {
    refuse('HUMAN_ADMIN_NOT_READY');
  }

  if (!validBcryptHash(administrator.passwordHash)) {
    refuse('HUMAN_ADMIN_PASSWORD_NOT_PREPARED');
  }

  if (
    !counts ||
    counts.labUsers !== 2 ||
    counts.labRoles !== 1 ||
    counts.labRoleAssignments !== 2 ||
    counts.labSessions !== 0 ||
    counts.labRefreshTokens !== 0 ||
    counts.labConnectors !== 0 ||
    counts.labIncidents !== 0
  ) {
    refuse('LAB_STATE_NOT_READY');
  }

  return Object.freeze({
    status: 'PREFLIGHT_CONDITIONS_MET',
    tenantId: lab.id,
    administratorId: administrator.id,
    activationExecuted: false,
    deploymentAuthorized: false,
    requiresExplicitApproval: true,
  });
}
