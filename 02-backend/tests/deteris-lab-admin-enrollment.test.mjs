import test from 'node:test';
import assert from 'node:assert/strict';

import {
  enrollInactiveLabAdministrator,
} from '../scripts/deteris-lab-admin-enrollment.mjs';

const LAB_ID = 'lab-id';
const ROLE_ID = 'lab-role-id';

const DATA = Object.freeze({
  permit: true,
  email: 'admin@example.test',
  firstName: 'Admin',
  lastName: 'Laboratoire',
});

function fakePrisma(options = {}) {
  const calls = [];
  let committed = false;

  const tx = {
    tenant: {
      findUnique: async ({ where }) => {
        if (where.slug === 'opencrisis-initial') {
          return { id: 'initial-id', isActive: true };
        }

        return {
          id: LAB_ID,
          isActive: options.labActive ?? false,
          incidentIngestionMode: 'SEMI_AUTOMATIC',
          automaticCreationApproved: false,
        };
      },
    },

    role: {
      findFirst: async () => ({
        id: ROLE_ID,
        permissions: [
          ['ADMIN', 'READ'],
          ['ADMIN', 'WRITE'],
          ['DASHBOARD', 'READ'],
          ['DASHBOARD', 'WRITE'],
        ].slice(
          0,
          options.missingRolePermission ? 3 : 4
        ).map(([resource, action]) => ({
          permission: { resource, action },
        })),
      }),
    },

    user: {
      findUnique: async ({ where }) => {
        if (
          where.email === 'bootstrap@deteris-r2d.invalid'
        ) {
          return {
            id: 'bootstrap-id',
            tenantId: LAB_ID,
            isActive: false,
            passwordHash: '!DISABLED_BOOTSTRAP_NO_PASSWORD!',
            roleAssignments: [{ roleId: ROLE_ID }],
          };
        }

        return options.emailExists ? { id: 'other-id' } : null;
      },

      count: async () =>
        options.alreadyEnrolled ? 2 : 1,

      create: async ({ data }) => {
        calls.push('user.create');

        assert.equal(data.tenantId, LAB_ID);
        assert.equal(data.isActive, false);
        assert.equal(data.mustChangePassword, true);
        assert.equal(data.sessionVersion, 0);
        assert.equal(
          data.passwordHash,
          '!DISABLED_BOOTSTRAP_NO_PASSWORD!',
        );
        assert.deepEqual(
          data.roleAssignments.create,
          [{ roleId: ROLE_ID }],
        );

        return {
          id: 'human-id',
          tenantId: LAB_ID,
          isActive: false,
          mustChangePassword: true,
          sessionVersion: 0,
        };
      },
    },

    auditLog: {
      create: async ({ data }) => {
        calls.push('auditLog.create');

        assert.equal(data.tenantId, LAB_ID);
        assert.equal(data.userId, null);
        assert.equal(data.metadata.activationAllowed, false);

        if (options.auditFailure) {
          throw new Error('FORCED_AUDIT_FAILURE');
        }

        return { id: 'audit-id', tenantId: LAB_ID };
      },
    },
  };

  return {
    calls,
    get committed() {
      return committed;
    },
    adapter: {
      async $transaction(callback, settings) {
        calls.push('transaction.begin');
        assert.equal(settings.isolationLevel, 'Serializable');

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
    },
  };
}

test('permission explicite obligatoire', async () => {
  const fake = fakePrisma();

  await assert.rejects(
    enrollInactiveLabAdministrator(
      fake.adapter, { ...DATA, permit: false }
    ),
    /ENROLLMENT_NOT_AUTHORIZED/
  );

  assert.deepEqual(fake.calls, []);
});

test('email reserve refuse', async () => {
  const fake = fakePrisma();

  await assert.rejects(
    enrollInactiveLabAdministrator(fake.adapter, {
      ...DATA,
      email: 'admin@opencrisis.local',
    }),
    /INVALID_ADMIN_EMAIL/
  );
});

test('identite incomplete refusee', async () => {
  const fake = fakePrisma();

  await assert.rejects(
    enrollInactiveLabAdministrator(fake.adapter, {
      ...DATA,
      firstName: '',
    }),
    /INVALID_ADMIN_IDENTITY/
  );
});

test('tenant actif refuse', async () => {
  const fake = fakePrisma({ labActive: true });

  await assert.rejects(
    enrollInactiveLabAdministrator(fake.adapter, DATA),
    /INACTIVE_LAB_NOT_VERIFIED/
  );
});

test('permissions incompletes refusees', async () => {
  const fake = fakePrisma({
    missingRolePermission: true,
  });

  await assert.rejects(
    enrollInactiveLabAdministrator(fake.adapter, DATA),
    /DEDICATED_ROLE_PERMISSIONS_INVALID/
  );
});

test('second enrôlement refuse', async () => {
  const fake = fakePrisma({ alreadyEnrolled: true });

  await assert.rejects(
    enrollInactiveLabAdministrator(fake.adapter, DATA),
    /LAB_ENROLLMENT_ALREADY_INITIALIZED/
  );

  assert.equal(fake.calls.includes('user.create'), false);
});

test('email deja attribue refuse', async () => {
  const fake = fakePrisma({ emailExists: true });

  await assert.rejects(
    enrollInactiveLabAdministrator(fake.adapter, DATA),
    /ADMIN_EMAIL_ALREADY_USED/
  );
});

test('administrateur cree mais desactive', async () => {
  const fake = fakePrisma();

  const result = await enrollInactiveLabAdministrator(
    fake.adapter, DATA,
  );

  assert.equal(result.status, 'ADMIN_ENROLLED_DISABLED');
  assert.equal(result.accountActive, false);
  assert.equal(result.tenantActive, false);
  assert.equal(result.activationAllowed, false);
  assert.equal(fake.committed, true);
  assert.equal(fake.calls.includes('user.create'), true);
  assert.equal(fake.calls.includes('auditLog.create'), true);
});

test('echec audit declenche rollback', async () => {
  const fake = fakePrisma({ auditFailure: true });

  await assert.rejects(
    enrollInactiveLabAdministrator(fake.adapter, DATA),
    /FORCED_AUDIT_FAILURE/
  );

  assert.equal(fake.committed, false);
  assert.equal(
    fake.calls.includes('transaction.rollback'),
    true,
  );
});
