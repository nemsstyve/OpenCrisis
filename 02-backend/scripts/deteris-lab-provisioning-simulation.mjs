/**
 * Simulation locale du provisionnement Deteris-R2D Lab.
 *
 * AUCUN Prisma, SQL, Docker, reseau ou acces a la production.
 * Une transaction simulee utilise une copie de l'etat.
 * Les changements ne sont publies qu'apres validation complete.
 */

import {
  LAB_IDENTITY,
  LabProvisioningError,
  prepareLabTenantPlan,
} from './deteris-lab-provisioning-plan.mjs';

function refuse(code) {
  throw new LabProvisioningError(code);
}

function clone(value) {
  return structuredClone(value);
}

function validateState(state) {
  if (
    !state ||
    typeof state !== 'object' ||
    Array.isArray(state) ||
    !Array.isArray(state.tenants) ||
    !Array.isArray(state.users) ||
    !Array.isArray(state.connectors) ||
    !Array.isArray(state.administratorRoles) ||
    !Number.isInteger(state.adminWritePermissions) ||
    !Number.isInteger(state.dashboardWritePermissions)
  ) {
    refuse('INVALID_DATABASE_SNAPSHOT');
  }

  const slugs = new Set();

  for (const tenant of state.tenants) {
    if (
      !tenant ||
      typeof tenant.slug !== 'string' ||
      typeof tenant.isActive !== 'boolean'
    ) {
      refuse('INVALID_TENANT_RECORD');
    }

    if (slugs.has(tenant.slug)) {
      refuse('DUPLICATE_TENANT_SLUG');
    }

    slugs.add(tenant.slug);
  }

  return state;
}

function snapshotForPlan(state) {
  return {
    tenants: state.tenants.map(tenant => ({
      slug: tenant.slug,
      isActive: tenant.isActive,
    })),
    administratorRoles: clone(state.administratorRoles),
    adminWritePermissions: state.adminWritePermissions,
    dashboardWritePermissions: state.dashboardWritePermissions,
  };
}

export function simulateInactiveLabProvisioning(
  initialState,
  { failurePoint = null } = {},
) {
  const working = validateState(clone(initialState));

  // Ce plan est non executable sur une base reelle.
  const plan = prepareLabTenantPlan(
    snapshotForPlan(working),
  );

  if (plan.executionAllowed !== false) {
    refuse('UNEXPECTED_EXECUTION_AUTHORIZATION');
  }

  if (failurePoint === 'beforeCreate') {
    refuse('SIMULATED_TRANSACTION_FAILURE');
  }

  // Creation uniquement dans la copie transactionnelle.
  const newTenant = {
    ...plan.target,
    id: 'simulated-lab-tenant-id',
  };

  working.tenants.push(newTenant);

  if (failurePoint === 'afterCreate') {
    refuse('SIMULATED_TRANSACTION_FAILURE');
  }

  // Verification de postconditions avant publication.
  const created = working.tenants.filter(
    tenant => tenant.slug === LAB_IDENTITY.slug,
  );

  if (
    created.length !== 1 ||
    created[0].isActive !== false ||
    created[0].incidentIngestionMode !== 'SEMI_AUTOMATIC' ||
    created[0].automaticCreationApproved !== false
  ) {
    refuse('POSTCONDITION_FAILED');
  }

  const initialBefore = initialState.tenants.find(
    tenant => tenant.slug === LAB_IDENTITY.initialSlug,
  );

  const initialAfter = working.tenants.find(
    tenant => tenant.slug === LAB_IDENTITY.initialSlug,
  );

  if (
    JSON.stringify(initialBefore) !==
    JSON.stringify(initialAfter)
  ) {
    refuse('INITIAL_TENANT_CHANGED');
  }

  if (
    JSON.stringify(initialState.users) !==
      JSON.stringify(working.users) ||
    JSON.stringify(initialState.connectors) !==
      JSON.stringify(working.connectors) ||
    JSON.stringify(initialState.administratorRoles) !==
      JSON.stringify(working.administratorRoles)
  ) {
    refuse('UNAUTHORIZED_SIDE_EFFECT');
  }

  return {
    status: 'SIMULATED_COMMIT',
    executionAllowed: false,
    plan,
    database: working,
  };
}
