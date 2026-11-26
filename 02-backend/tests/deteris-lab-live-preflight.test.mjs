import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

import {
  validateLiveInventory,
} from '../scripts/deteris-lab-live-preflight.mjs';

function inventory() {
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

test('inventaire conforme donne un plan non executable', () => {
  const plan = validateLiveInventory(inventory());

  assert.equal(plan.executionAllowed, false);
  assert.equal(plan.target.slug, 'deteris-r2d-lab');
  assert.equal(plan.target.isActive, false);
  assert.equal(
    plan.target.incidentIngestionMode,
    'SEMI_AUTOMATIC'
  );
});

test('refus du tenant deja present', () => {
  const data = inventory();
  data.tenants.push({
    slug: 'deteris-r2d-lab',
    isActive: false,
  });

  assert.throws(() => validateLiveInventory(data));
});

test('refus des slugs dupliques', () => {
  const data = inventory();
  data.tenants.push({
    slug: 'opencrisis-initial',
    isActive: true,
  });

  assert.throws(
    () => validateLiveInventory(data),
    /DUPLICATE_LIVE_TENANT_SLUG/
  );
});

test('refus du champ supplementaire', () => {
  const data = inventory();
  data.unsafe = true;

  assert.throws(
    () => validateLiveInventory(data),
    /INVALID_LIVE_INVENTORY_FIELDS/
  );
});

test('refus des donnees tenant incompletes', () => {
  const data = inventory();
  delete data.tenants[0].isActive;

  assert.throws(
    () => validateLiveInventory(data),
    /INVALID_LIVE_TENANTS/
  );
});

test('refus si ADMIN WRITE absent', () => {
  const data = inventory();
  data.administratorRoles[0].canAdminWrite = false;

  assert.throws(() => validateLiveInventory(data));
});

test('refus du role lie au tenant initial', () => {
  const data = inventory();
  data.administratorRoles[0].tenantId = 'initial';

  assert.throws(() => validateLiveInventory(data));
});

test('refus de JSON invalide sur stdin', () => {
  const result = spawnSync(
    process.execPath,
    [
      '02-backend/scripts/deteris-lab-live-preflight.mjs',
    ],
    {
      input: '{invalid',
      encoding: 'utf8',
    }
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /REFUS PREFLIGHT/);
  assert.doesNotMatch(result.stdout, /PASS/);
});

test('lecture stdin valide sans execution', () => {
  const result = spawnSync(
    process.execPath,
    [
      '02-backend/scripts/deteris-lab-live-preflight.mjs',
    ],
    {
      input: JSON.stringify(inventory()),
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_DISABLE_COLORS: '1',
        FORCE_COLOR: '0',
      },
    }
  );

  assert.equal(result.status, 0);
  assert.match(
    result.stdout,
    /EXECUTION AUTORISEE : false/
  );
  assert.match(
    result.stdout,
    /AUCUNE ECRITURE DEMANDEE/
  );
});
