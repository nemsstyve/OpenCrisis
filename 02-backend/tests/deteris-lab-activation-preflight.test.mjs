import test from 'node:test';
import assert from 'node:assert/strict';

import {
  inspectLabActivationReadiness,
} from '../scripts/deteris-lab-activation-preflight.mjs';

const HASH = '$2b$12$' + 'A'.repeat(53);

function fixture() {
  return {
    initial: {
      id: 'initial-id',
      slug: 'opencrisis-initial',
      isActive: true,
    },
    lab: {
      id: 'lab-id',
      slug: 'deteris-r2d-lab',
      isActive: false,
      incidentIngestionMode: 'SEMI_AUTOMATIC',
      automaticCreationApproved: false,
    },
    role: {
      id: 'role-id',
      tenantId: 'lab-id',
      name: 'Deteris Lab Administrateur',
      isSystem: false,
      permissions: [
        'ADMIN:READ',
        'ADMIN:WRITE',
        'DASHBOARD:READ',
        'DASHBOARD:WRITE',
      ],
    },
    bootstrap: {
      tenantId: 'lab-id',
      email: 'bootstrap@deteris-r2d.invalid',
      isActive: false,
      passwordHash: '!DISABLED_BOOTSTRAP_NO_PASSWORD!',
      roleIds: ['role-id'],
    },
    administrator: {
      id: 'human-id',
      tenantId: 'lab-id',
      email: 'admin@example.test',
      isActive: false,
      mustChangePassword: true,
      sessionVersion: 0,
      passwordHash: HASH,
      roleIds: ['role-id'],
    },
    counts: {
      labUsers: 2,
      labRoles: 1,
      labRoleAssignments: 2,
      labSessions: 0,
      labRefreshTokens: 0,
      labConnectors: 0,
      labIncidents: 0,
    },
  };
}

function expectRefusal(change, code) {
  const snapshot = fixture();
  change(snapshot);

  assert.throws(
    () => inspectLabActivationReadiness(snapshot),
    error => error.code === code,
  );
}

test('snapshot invalide refuse', () => {
  assert.throws(
    () => inspectLabActivationReadiness(null),
    /INVALID_ACTIVATION_SNAPSHOT/,
  );
});

test('organisation initiale inactive refusee', () => {
  expectRefusal(
    x => { x.initial.isActive = false; },
    'INITIAL_TENANT_NOT_VERIFIED',
  );
});

test('laboratoire actif refuse', () => {
  expectRefusal(
    x => { x.lab.isActive = true; },
    'LAB_INACTIVE_STATE_INVALID',
  );
});

test('creation automatique refusee', () => {
  expectRefusal(
    x => { x.lab.automaticCreationApproved = true; },
    'LAB_INACTIVE_STATE_INVALID',
  );
});

test('role global refuse', () => {
  expectRefusal(
    x => { x.role.isSystem = true; },
    'LAB_ADMIN_ROLE_INVALID',
  );
});

test('permission supplementaire refusee', () => {
  expectRefusal(
    x => { x.role.permissions.push('DOCUMENTS:WRITE'); },
    'LAB_ADMIN_ROLE_INVALID',
  );
});

test('compte bootstrap actif refuse', () => {
  expectRefusal(
    x => { x.bootstrap.isActive = true; },
    'BOOTSTRAP_ACCOUNT_UNSAFE',
  );
});

test('administrateur humain actif refuse', () => {
  expectRefusal(
    x => { x.administrator.isActive = true; },
    'HUMAN_ADMIN_NOT_READY',
  );
});

test('mot de passe placeholder refuse', () => {
  expectRefusal(
    x => {
      x.administrator.passwordHash =
        '!DISABLED_BOOTSTRAP_NO_PASSWORD!';
    },
    'HUMAN_ADMIN_PASSWORD_NOT_PREPARED',
  );
});

test('session deja presente refusee', () => {
  expectRefusal(
    x => { x.counts.labSessions = 1; },
    'LAB_STATE_NOT_READY',
  );
});

test('scenario conforme ne declenche aucune activation', () => {
  const snapshot = fixture();

  const result = inspectLabActivationReadiness(snapshot);

  assert.equal(result.status, 'PREFLIGHT_CONDITIONS_MET');
  assert.equal(result.activationExecuted, false);
  assert.equal(result.deploymentAuthorized, false);
  assert.equal(result.requiresExplicitApproval, true);
  assert.equal(snapshot.lab.isActive, false);
  assert.equal(snapshot.administrator.isActive, false);
  assert.equal(Object.isFrozen(result), true);
});
