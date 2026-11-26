import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LAB_IDENTITY,
  LabProvisioningError,
  prepareLabTenantPlan,
} from '../scripts/deteris-lab-provisioning-plan.mjs';

function validSnapshot() {
  return {
    tenants: [
      {
        slug: 'opencrisis-initial',
        isActive: true,
      },
    ],
    administratorRoles: [
      {
        name: 'Administrateur',
        isSystem: true,
        tenantId: null,
        canAdminWrite: true,
        canDashboardWrite: true,
      },
    ],
    adminWritePermissions: 1,
    dashboardWritePermissions: 1,
  };
}

function expectRefused(snapshot, code) {
  assert.throws(
    () => prepareLabTenantPlan(snapshot),
    error =>
      error instanceof LabProvisioningError &&
      error.code === code,
  );
}

test('plan valide mais execution interdite', () => {
  const snapshot = validSnapshot();
  const plan = prepareLabTenantPlan(snapshot);

  assert.equal(plan.executionAllowed, false);
  assert.equal(plan.operation, 'CREATE_INACTIVE_LAB_TENANT');
  assert.equal(plan.target.name, 'Deteris-R2D Lab');
  assert.equal(plan.target.slug, LAB_IDENTITY.slug);
  assert.equal(plan.target.isActive, false);
  assert.equal(plan.target.incidentIngestionMode, 'SEMI_AUTOMATIC');
  assert.equal(plan.target.automaticCreationApproved, false);

  assert.equal(plan.effects.createUsers, false);
  assert.equal(plan.effects.createConnectors, false);
  assert.equal(plan.effects.createIncidents, false);
  assert.equal(plan.effects.modifyInitialTenant, false);
});

test('plan et cible immuables', () => {
  const plan = prepareLabTenantPlan(validSnapshot());

  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.target), true);
  assert.equal(Object.isFrozen(plan.prerequisites), true);
  assert.equal(Object.isFrozen(plan.effects), true);
});

test('tenant initial absent refuse', () => {
  const snapshot = validSnapshot();
  snapshot.tenants = [];
  expectRefused(snapshot, 'INITIAL_TENANT_NOT_VERIFIED');
});

test('tenant initial inactif refuse', () => {
  const snapshot = validSnapshot();
  snapshot.tenants[0].isActive = false;
  expectRefused(snapshot, 'INITIAL_TENANT_NOT_VERIFIED');
});

test('doublon tenant initial refuse', () => {
  const snapshot = validSnapshot();
  snapshot.tenants.push({
    slug: 'opencrisis-initial',
    isActive: true,
  });
  expectRefused(snapshot, 'INITIAL_TENANT_NOT_VERIFIED');
});

test('laboratoire existant refuse', () => {
  const snapshot = validSnapshot();
  snapshot.tenants.push({
    slug: 'deteris-r2d-lab',
    isActive: false,
  });
  expectRefused(snapshot, 'LAB_TENANT_ALREADY_EXISTS');
});

test('role administrateur absent refuse', () => {
  const snapshot = validSnapshot();
  snapshot.administratorRoles = [];
  expectRefused(snapshot, 'ADMIN_ROLE_NOT_UNIQUE');
});

test('plusieurs roles administrateurs refuses', () => {
  const snapshot = validSnapshot();
  snapshot.administratorRoles.push({
    ...snapshot.administratorRoles[0],
  });
  expectRefused(snapshot, 'ADMIN_ROLE_NOT_UNIQUE');
});

test('role non systeme refuse', () => {
  const snapshot = validSnapshot();
  snapshot.administratorRoles[0].isSystem = false;
  expectRefused(snapshot, 'ADMIN_ROLE_NOT_VERIFIED');
});

test('role lie au tenant initial refuse', () => {
  const snapshot = validSnapshot();
  snapshot.administratorRoles[0].tenantId = 'initial-id';
  expectRefused(snapshot, 'ADMIN_ROLE_NOT_VERIFIED');
});

test('ADMIN WRITE absent refuse', () => {
  const snapshot = validSnapshot();
  snapshot.adminWritePermissions = 0;
  expectRefused(snapshot, 'ADMIN_PERMISSIONS_NOT_VERIFIED');
});

test('DASHBOARD WRITE absent refuse', () => {
  const snapshot = validSnapshot();
  snapshot.dashboardWritePermissions = 0;
  expectRefused(snapshot, 'ADMIN_PERMISSIONS_NOT_VERIFIED');
});

test('ADMIN WRITE non attribue au role refuse', () => {
  const snapshot = validSnapshot();
  snapshot.administratorRoles[0].canAdminWrite = false;
  expectRefused(snapshot, 'ADMIN_ROLE_NOT_VERIFIED');
});

test('DASHBOARD WRITE non attribue au role refuse', () => {
  const snapshot = validSnapshot();
  snapshot.administratorRoles[0].canDashboardWrite = false;
  expectRefused(snapshot, 'ADMIN_ROLE_NOT_VERIFIED');
});

test('snapshot incomplet refuse', () => {
  expectRefused({}, 'INVALID_SNAPSHOT');
});

test('champ supplementaire refuse', () => {
  const snapshot = validSnapshot();
  snapshot.unsafeOverride = true;
  expectRefused(snapshot, 'INVALID_SNAPSHOT');
});
