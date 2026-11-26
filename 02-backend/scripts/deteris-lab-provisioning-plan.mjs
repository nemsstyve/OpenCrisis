/**
 * Deteris-R2D Lab - contrat de provisionnement.
 *
 * Module pur : aucun Prisma, aucun SQL, aucun reseau,
 * aucune lecture de secrets, aucune ecriture.
 *
 * Un plan valide ne constitue PAS une autorisation
 * d'execution contre la base active.
 */

export const LAB_IDENTITY = Object.freeze({
  name: 'Deteris-R2D Lab',
  slug: 'deteris-r2d-lab',
  initialSlug: 'opencrisis-initial',
});

export class LabProvisioningError extends Error {
  constructor(code) {
    super(code);
    this.name = 'LabProvisioningError';
    this.code = code;
  }
}

function refuse(code) {
  throw new LabProvisioningError(code);
}

function exactKeys(object, keys) {
  if (
    !object ||
    typeof object !== 'object' ||
    Array.isArray(object)
  ) {
    return false;
  }

  const actual = Object.keys(object).sort();
  const expected = [...keys].sort();

  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

export function prepareLabTenantPlan(snapshot) {
  if (!exactKeys(snapshot, [
    'tenants',
    'administratorRoles',
    'adminWritePermissions',
    'dashboardWritePermissions',
  ])) {
    refuse('INVALID_SNAPSHOT');
  }

  if (
    !Array.isArray(snapshot.tenants) ||
    !Array.isArray(snapshot.administratorRoles)
  ) {
    refuse('INVALID_SNAPSHOT');
  }

  const initial = snapshot.tenants.filter(
    tenant =>
      tenant &&
      tenant.slug === LAB_IDENTITY.initialSlug
  );

  if (initial.length !== 1 || initial[0].isActive !== true) {
    refuse('INITIAL_TENANT_NOT_VERIFIED');
  }

  if (
    snapshot.tenants.some(
      tenant => tenant && tenant.slug === LAB_IDENTITY.slug
    )
  ) {
    refuse('LAB_TENANT_ALREADY_EXISTS');
  }

  // Un inventaire incomplet est interdit : le service chargeant
  // les donnees devra garantir un inventaire exhaustif.
  if (
    snapshot.adminWritePermissions !== 1 ||
    snapshot.dashboardWritePermissions !== 1
  ) {
    refuse('ADMIN_PERMISSIONS_NOT_VERIFIED');
  }

  if (snapshot.administratorRoles.length !== 1) {
    refuse('ADMIN_ROLE_NOT_UNIQUE');
  }

  const role = snapshot.administratorRoles[0];

  if (
    !role ||
    role.name !== 'Administrateur' ||
    role.isSystem !== true ||
    role.tenantId !== null ||
    role.canAdminWrite !== true ||
    role.canDashboardWrite !== true
  ) {
    refuse('ADMIN_ROLE_NOT_VERIFIED');
  }

  return Object.freeze({
    operation: 'CREATE_INACTIVE_LAB_TENANT',
    target: Object.freeze({
      name: LAB_IDENTITY.name,
      slug: LAB_IDENTITY.slug,
      isActive: false,
      incidentIngestionMode: 'SEMI_AUTOMATIC',
      automaticCreationApproved: false,
    }),
    prerequisites: Object.freeze({
      initialTenantMustRemainUnchanged: true,
      uniqueSlugRequired: true,
      administratorProvisioningRequired: true,
      separateWazuhConnectorRequired: true,
    }),
    effects: Object.freeze({
      createUsers: false,
      createConnectors: false,
      createIncidents: false,
      modifyInitialTenant: false,
    }),
    executionAllowed: false,
  });
}
