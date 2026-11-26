import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LabProvisioningError,
} from '../scripts/deteris-lab-provisioning-plan.mjs';

import {
  simulateInactiveLabProvisioning,
} from '../scripts/deteris-lab-provisioning-simulation.mjs';

function database() {
  return {
    tenants: [{
      id: 'existing-tenant-id',
      name: 'OpenCrisis - Organisation initiale',
      slug: 'opencrisis-initial',
      isActive: true,
      incidentIngestionMode: 'MANUAL',
      automaticCreationApproved: false,
    }],
    users: [{
      id: 'existing-admin-id',
      tenantId: 'existing-tenant-id',
    }],
    connectors: [{
      id: 'existing-connector-id',
      tenantId: 'existing-tenant-id',
      sourceId: 'wazuh-vm100',
    }],
    administratorRoles: [{
      name: 'Administrateur',
      isSystem: true,
      tenantId: null,
      canAdminWrite: true,
      canDashboardWrite: true,
    }],
    adminWritePermissions: 1,
    dashboardWritePermissions: 1,
  };
}

function refused(state, options, code) {
  assert.throws(
    () => simulateInactiveLabProvisioning(state, options),
    error =>
      error instanceof LabProvisioningError &&
      error.code === code,
  );
}

test('creation simulee inactive uniquement', () => {
  const result = simulateInactiveLabProvisioning(database());

  assert.equal(result.status, 'SIMULATED_COMMIT');
  assert.equal(result.executionAllowed, false);
  assert.equal(result.database.tenants.length, 2);

  const lab = result.database.tenants[1];

  assert.equal(lab.slug, 'deteris-r2d-lab');
  assert.equal(lab.isActive, false);
  assert.equal(lab.incidentIngestionMode, 'SEMI_AUTOMATIC');
  assert.equal(lab.automaticCreationApproved, false);
});

test('la source ne subit aucune mutation', () => {
  const source = database();
  const original = structuredClone(source);

  simulateInactiveLabProvisioning(source);

  assert.deepEqual(source, original);
});

test('organisation initiale preservee', () => {
  const source = database();
  const result = simulateInactiveLabProvisioning(source);

  assert.deepEqual(
    result.database.tenants[0],
    source.tenants[0],
  );
});

test('utilisateurs et connecteurs preserves', () => {
  const source = database();
  const result = simulateInactiveLabProvisioning(source);

  assert.deepEqual(result.database.users, source.users);
  assert.deepEqual(
    result.database.connectors,
    source.connectors,
  );
  assert.equal(result.database.users.length, 1);
  assert.equal(result.database.connectors.length, 1);
});

test('roles administratifs preserves', () => {
  const source = database();
  const result = simulateInactiveLabProvisioning(source);

  assert.deepEqual(
    result.database.administratorRoles,
    source.administratorRoles,
  );
});

test('refus si le laboratoire existe deja', () => {
  const source = database();
  source.tenants.push({
    slug: 'deteris-r2d-lab',
    isActive: false,
  });

  refused(source, {}, 'LAB_TENANT_ALREADY_EXISTS');
});

test('refus des slugs dupliques', () => {
  const source = database();
  source.tenants.push({
    slug: 'opencrisis-initial',
    isActive: true,
  });

  refused(source, {}, 'DUPLICATE_TENANT_SLUG');
});

test('refus sans organisation initiale', () => {
  const source = database();
  source.tenants = [];

  refused(source, {}, 'INITIAL_TENANT_NOT_VERIFIED');
});

test('refus sans permission ADMIN WRITE', () => {
  const source = database();
  source.adminWritePermissions = 0;

  refused(source, {}, 'ADMIN_PERMISSIONS_NOT_VERIFIED');
});

test('refus si role admin non conforme', () => {
  const source = database();
  source.administratorRoles[0].tenantId = 'existing-tenant-id';

  refused(source, {}, 'ADMIN_ROLE_NOT_VERIFIED');
});

test('echec avant creation sans effet', () => {
  const source = database();
  const original = structuredClone(source);

  refused(
    source,
    { failurePoint: 'beforeCreate' },
    'SIMULATED_TRANSACTION_FAILURE',
  );

  assert.deepEqual(source, original);
});

test('echec apres creation avec rollback simule', () => {
  const source = database();
  const original = structuredClone(source);

  refused(
    source,
    { failurePoint: 'afterCreate' },
    'SIMULATED_TRANSACTION_FAILURE',
  );

  assert.deepEqual(source, original);
});

test('seconde creation refusee apres commit simule', () => {
  const first = simulateInactiveLabProvisioning(database());

  refused(
    first.database,
    {},
    'LAB_TENANT_ALREADY_EXISTS',
  );
});

test('snapshot incomplet refuse', () => {
  refused(
    { tenants: [] },
    {},
    'INVALID_DATABASE_SNAPSHOT',
  );
});

test('enregistrement tenant invalide refuse', () => {
  const source = database();
  source.tenants[0].isActive = 'true';

  refused(source, {}, 'INVALID_TENANT_RECORD');
});

test('une copie du resultat ne modifie pas la source', () => {
  const source = database();
  const result = simulateInactiveLabProvisioning(source);

  result.database.tenants[1].name = 'Nom modifie';

  assert.equal(source.tenants.length, 1);
  assert.equal(
    source.tenants[0].name,
    'OpenCrisis - Organisation initiale',
  );
});
