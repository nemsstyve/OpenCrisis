import test from 'node:test';
import assert from 'node:assert/strict';

import {
  inspectLabActivationFromPrisma,
} from '../scripts/deteris-lab-activation-prisma-preflight.mjs';

const HASH = '$2b$12$' + 'A'.repeat(53);

function fakePrisma(options = {}) {
  const calls = [];

  const tx = {
    $executeRawUnsafe: async statement => {
      calls.push('SQL_READ_ONLY');
      assert.equal(statement, 'SET TRANSACTION READ ONLY');
    },

    tenant: {
      findUnique: async ({ where }) => {
        calls.push('tenant.findUnique');

        if (where.slug === 'opencrisis-initial') {
          return {
            id: 'initial-id',
            slug: 'opencrisis-initial',
            isActive: true,
          };
        }

        if (options.missingLab) return null;

        return {
          id: 'lab-id',
          slug: 'deteris-r2d-lab',
          isActive: false,
          incidentIngestionMode: 'SEMI_AUTOMATIC',
          automaticCreationApproved: false,
        };
      },
    },

    role: {
      findMany: async () => {
        calls.push('role.findMany');

        if (options.extraRole) {
          return [{}, {}];
        }

        return [{
          id: 'role-id',
          tenantId: 'lab-id',
          name: 'Deteris Lab Administrateur',
          isSystem: false,
          permissions: [
            ['ADMIN', 'READ'],
            ['ADMIN', 'WRITE'],
            ['DASHBOARD', 'READ'],
            ['DASHBOARD', 'WRITE'],
          ].map(([resource, action]) => ({
            permission: { resource, action },
          })),
        }];
      },
    },

    user: {
      findMany: async () => {
        calls.push('user.findMany');

        const users = [
          {
            id: 'bootstrap-id',
            tenantId: 'lab-id',
            email: 'bootstrap@deteris-r2d.invalid',
            isActive: false,
            passwordHash: '!DISABLED_BOOTSTRAP_NO_PASSWORD!',
            roleAssignments: [{ roleId: 'role-id' }],
          },
          {
            id: 'human-id',
            tenantId: 'lab-id',
            email: 'admin@example.test',
            isActive: false,
            mustChangePassword: true,
            sessionVersion: 0,
            passwordHash: options.placeholder
              ? '!DISABLED_BOOTSTRAP_NO_PASSWORD!'
              : HASH,
            roleAssignments: [{ roleId: 'role-id' }],
          },
        ];

        return options.extraUser
          ? [...users, { id: 'extra' }]
          : users;
      },
    },

    roleAssignment: {
      count: async () => 2,
    },
    authSession: {
      count: async () => options.existingSession ? 1 : 0,
    },
    refreshToken: {
      count: async () => 0,
    },
    wazuhConnector: {
      count: async () => 0,
    },
    incident: {
      count: async () => 0,
    },
  };

  return {
    calls,
    adapter: {
      async $transaction(callback, settings) {
        calls.push('transaction.begin');

        assert.equal(
          settings.isolationLevel,
          'Serializable',
        );

        const result = await callback(tx);
        calls.push('transaction.end');
        return result;
      },
    },
  };
}

test('permission explicite obligatoire', async () => {
  const fake = fakePrisma();

  await assert.rejects(
    inspectLabActivationFromPrisma(fake.adapter),
    /PREFLIGHT_NOT_AUTHORIZED/,
  );

  assert.deepEqual(fake.calls, []);
});

test('adaptateur invalide refuse', async () => {
  await assert.rejects(
    inspectLabActivationFromPrisma(
      {}, { permit: true }
    ),
    /INVALID_PRISMA_ADAPTER/,
  );
});

test('inventaire du tenant obligatoire', async () => {
  const fake = fakePrisma({ missingLab: true });

  await assert.rejects(
    inspectLabActivationFromPrisma(
      fake.adapter, { permit: true }
    ),
    /REQUIRED_TENANT_MISSING/,
  );
});

test('role supplementaire refuse', async () => {
  const fake = fakePrisma({ extraRole: true });

  await assert.rejects(
    inspectLabActivationFromPrisma(
      fake.adapter, { permit: true }
    ),
    /LAB_INVENTORY_UNEXPECTED/,
  );
});

test('utilisateur supplementaire refuse', async () => {
  const fake = fakePrisma({ extraUser: true });

  await assert.rejects(
    inspectLabActivationFromPrisma(
      fake.adapter, { permit: true }
    ),
    /LAB_INVENTORY_UNEXPECTED/,
  );
});

test('mot de passe non prepare refuse', async () => {
  const fake = fakePrisma({ placeholder: true });

  await assert.rejects(
    inspectLabActivationFromPrisma(
      fake.adapter, { permit: true }
    ),
    /HUMAN_ADMIN_PASSWORD_NOT_PREPARED/,
  );
});

test('session deja presente refusee', async () => {
  const fake = fakePrisma({ existingSession: true });

  await assert.rejects(
    inspectLabActivationFromPrisma(
      fake.adapter, { permit: true }
    ),
    /LAB_STATE_NOT_READY/,
  );
});

test('inventaire conforme sans activation', async () => {
  const fake = fakePrisma();

  const result = await inspectLabActivationFromPrisma(
    fake.adapter, { permit: true },
  );

  assert.equal(result.status, 'PREFLIGHT_CONDITIONS_MET');
  assert.equal(result.source, 'POSTGRESQL_READ_ONLY');
  assert.equal(result.activationExecuted, false);
  assert.equal(result.deploymentAuthorized, false);

  assert.equal(
    fake.calls[1],
    'SQL_READ_ONLY',
  );

  assert.equal(
    JSON.stringify(result).includes(HASH),
    false,
  );
  assert.equal(Object.isFrozen(result), true);
});
