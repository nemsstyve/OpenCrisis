import test from 'node:test';
import assert from 'node:assert/strict';

import {
  provisionInactiveLabTenant,
} from '../scripts/deteris-lab-prisma-provisioner.mjs';

const LAB_ID = '11111111-1111-4111-8111-111111111111';

function fakePrisma(options = {}) {
  const calls = [];
  let committed = false;

  const tenants = [
    {
      slug: 'opencrisis-initial',
      isActive: true,
    },
  ];

  if (options.labExists) {
    tenants.push({
      slug: 'deteris-r2d-lab',
      isActive: false,
    });
  }

  const tx = {
    tenant: {
      count: async () => {
        calls.push('tenant.count');
        return options.incomplete
          ? tenants.length + 1
          : tenants.length;
      },

      findMany: async () => {
        calls.push('tenant.findMany');
        return structuredClone(tenants);
      },

      create: async ({ data, select }) => {
        calls.push('tenant.create');

        if (options.failCreate) {
          throw new Error('SIMULATED_DATABASE_ERROR');
        }

        assert.deepEqual(data, {
          name: 'Deteris-R2D Lab',
          slug: 'deteris-r2d-lab',
          isActive: false,
          incidentIngestionMode: 'SEMI_AUTOMATIC',
          automaticCreationApproved: false,
        });

        assert.equal(select.id, true);

        const result = {
          id: LAB_ID,
          slug: data.slug,
          isActive: data.isActive,
          incidentIngestionMode: data.incidentIngestionMode,
          automaticCreationApproved:
            data.automaticCreationApproved,
        };

        if (options.badPostcondition) {
          result.isActive = true;
        }

        return result;
      },
    },

    role: {
      findMany: async () => {
        calls.push('role.findMany');

        return [{
          name: 'Administrateur',
          isSystem: true,
          tenantId: null,
          permissions: [
            {
              permission: {
                resource: 'ADMIN',
                action: options.noAdminPermission
                  ? 'READ'
                  : 'WRITE',
              },
            },
            {
              permission: {
                resource: 'DASHBOARD',
                action: 'WRITE',
              },
            },
          ],
        }];
      },
    },

    permission: {
      count: async ({ where }) => {
        calls.push('permission.count');

        if (
          where.resource === 'ADMIN' &&
          options.missingPermission
        ) {
          return 0;
        }

        return 1;
      },
    },
  };

  const adapter = {
    async $transaction(callback, settings) {
      calls.push('transaction.begin');

      assert.equal(settings.isolationLevel, 'Serializable');
      assert.equal(settings.maxWait, 5000);
      assert.equal(settings.timeout, 10000);

      try {
        const result = await callback(tx);
        committed = true;
        calls.push('transaction.commit');
        return result;
      } catch (error) {
        calls.push('transaction.rollback');
        throw error;
      }
    },
  };

  return {
    adapter,
    calls,
    get committed() {
      return committed;
    },
  };
}

test('aucune execution sans permission explicite', async () => {
  const fake = fakePrisma();

  await assert.rejects(
    provisionInactiveLabTenant(fake.adapter),
    /DATABASE_MUTATION_NOT_AUTHORIZED/
  );

  assert.deepEqual(fake.calls, []);
});

test('adaptateur invalide refuse', async () => {
  await assert.rejects(
    provisionInactiveLabTenant(
      {},
      { permit: true },
    ),
    /INVALID_PRISMA_ADAPTER/
  );
});

test('creation inactive dans une transaction serializable', async () => {
  const fake = fakePrisma();

  const result = await provisionInactiveLabTenant(
    fake.adapter,
    { permit: true },
  );

  assert.equal(result.status, 'INACTIVE_TENANT_CREATED');
  assert.equal(result.tenantId, LAB_ID);
  assert.equal(result.isActive, false);
  assert.equal(
    result.incidentIngestionMode,
    'SEMI_AUTOMATIC',
  );
  assert.equal(
    result.automaticCreationApproved,
    false,
  );
  assert.equal(fake.committed, true);
  assert.equal(
    fake.calls.filter(call => call === 'tenant.create').length,
    1,
  );
});

test('tenant deja existant : refus avant creation', async () => {
  const fake = fakePrisma({ labExists: true });

  await assert.rejects(
    provisionInactiveLabTenant(
      fake.adapter,
      { permit: true },
    ),
    /LAB_TENANT_ALREADY_EXISTS/
  );

  assert.equal(
    fake.calls.includes('tenant.create'),
    false,
  );
  assert.equal(fake.committed, false);
});

test('inventaire incomplet : refus avant creation', async () => {
  const fake = fakePrisma({ incomplete: true });

  await assert.rejects(
    provisionInactiveLabTenant(
      fake.adapter,
      { permit: true },
    ),
    /INCOMPLETE_TENANT_INVENTORY/
  );

  assert.equal(
    fake.calls.includes('tenant.create'),
    false,
  );
});

test('permission manquante : refus avant creation', async () => {
  const fake = fakePrisma({ missingPermission: true });

  await assert.rejects(
    provisionInactiveLabTenant(
      fake.adapter,
      { permit: true },
    ),
    /ADMIN_PERMISSIONS_NOT_VERIFIED/
  );

  assert.equal(
    fake.calls.includes('tenant.create'),
    false,
  );
});

test('role non autorise : refus avant creation', async () => {
  const fake = fakePrisma({ noAdminPermission: true });

  await assert.rejects(
    provisionInactiveLabTenant(
      fake.adapter,
      { permit: true },
    ),
    /ADMIN_ROLE_NOT_VERIFIED/
  );

  assert.equal(
    fake.calls.includes('tenant.create'),
    false,
  );
});

test('erreur Prisma : rollback demande, aucun retry', async () => {
  const fake = fakePrisma({ failCreate: true });

  await assert.rejects(
    provisionInactiveLabTenant(
      fake.adapter,
      { permit: true },
    ),
    /SIMULATED_DATABASE_ERROR/
  );

  assert.equal(fake.committed, false);
  assert.equal(
    fake.calls.filter(call => call === 'transaction.begin').length,
    1,
  );
  assert.ok(fake.calls.includes('transaction.rollback'));
});

test('postcondition incorrecte : rollback demande', async () => {
  const fake = fakePrisma({ badPostcondition: true });

  await assert.rejects(
    provisionInactiveLabTenant(
      fake.adapter,
      { permit: true },
    ),
    /INVALID_CREATED_TENANT/
  );

  assert.equal(fake.committed, false);
  assert.ok(fake.calls.includes('transaction.rollback'));
});
