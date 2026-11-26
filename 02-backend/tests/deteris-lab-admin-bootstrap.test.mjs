import test from 'node:test';
import assert from 'node:assert/strict';

import {
  bootstrapInactiveLabAdmin,
} from '../scripts/deteris-lab-admin-bootstrap.mjs';

const INITIAL_ID = 'initial-tenant-id';
const LAB_ID = 'lab-tenant-id';

function fakePrisma(options = {}) {
  const calls = [];
  const records = [];

  const tx = {
    tenant: {
      findUnique: async ({ where }) => {
        calls.push('tenant.findUnique');

        if (where.slug === 'opencrisis-initial') {
          return options.missingInitial
            ? null
            : { id: INITIAL_ID, isActive: true };
        }

        if (where.slug === 'deteris-r2d-lab') {
          if (options.missingLab) return null;

          return {
            id: LAB_ID,
            isActive: options.activeLab ?? false,
            incidentIngestionMode: 'SEMI_AUTOMATIC',
            automaticCreationApproved: false,
          };
        }

        throw new Error('UNEXPECTED_TENANT_QUERY');
      },
    },

    user: {
      count: async () => {
        calls.push('user.count');
        return options.existingUser ? 1 : 0;
      },

      findUnique: async () => {
        calls.push('user.findUnique');
        return null;
      },

      create: async ({ data }) => {
        calls.push('user.create');
        records.push({ type: 'user', data });

        assert.equal(data.tenantId, LAB_ID);
        assert.equal(data.isActive, false);
        assert.equal(data.mustChangePassword, true);
        assert.equal(data.sessionVersion, 0);
        assert.equal(
          data.email,
          'bootstrap@deteris-r2d.invalid',
        );

        assert.equal(
          data.passwordHash,
          '!DISABLED_BOOTSTRAP_NO_PASSWORD!',
        );

        assert.deepEqual(
          data.roleAssignments.create,
          [{ roleId: 'lab-role-id' }],
        );

        return {
          id: 'lab-user-id',
          tenantId: LAB_ID,
          isActive: options.badAccount ? true : false,
          mustChangePassword: true,
          sessionVersion: 0,
        };
      },
    },

    role: {
      count: async () => {
        calls.push('role.count');
        return options.existingRole ? 1 : 0;
      },

      create: async ({ data }) => {
        calls.push('role.create');
        records.push({ type: 'role', data });

        assert.equal(
          data.name,
          'Deteris Lab Administrateur',
        );
        assert.equal(data.tenantId, LAB_ID);
        assert.equal(data.isSystem, false);
        assert.deepEqual(
          data.permissions.create,
          [
            { permissionId: 'ADMIN-READ' },
            { permissionId: 'ADMIN-WRITE' },
            { permissionId: 'DASHBOARD-READ' },
            { permissionId: 'DASHBOARD-WRITE' },
          ],
        );

        return {
          id: 'lab-role-id',
          tenantId: LAB_ID,
          isSystem: false,
        };
      },
    },

    permission: {
      findUnique: async ({ where }) => {
        calls.push('permission.findUnique');

        const { resource, action } =
          where.resource_action;

        if (
          options.missingPermission &&
          resource === 'ADMIN'
        ) {
          return null;
        }

        return {
          id: `${resource}-${action}`,
          resource,
          action,
        };
      },
    },

    auditLog: {
      create: async ({ data }) => {
        calls.push('auditLog.create');
        records.push({ type: 'audit', data });

        assert.equal(data.tenantId, LAB_ID);
        assert.equal(data.userId, null);
        assert.equal(data.resource, 'ADMIN');
        assert.equal(data.metadata.activationAllowed, false);

        if (options.failAudit) {
          throw new Error('SIMULATED_AUDIT_FAILURE');
        }

        return {
          id: 'audit-id',
          tenantId: LAB_ID,
        };
      },
    },
  };

  let committed = false;

  return {
    calls,
    records,

    get committed() {
      return committed;
    },

    adapter: {
      async $transaction(callback, settings) {
        calls.push('transaction.begin');

        assert.equal(
          settings.isolationLevel,
          'Serializable',
        );

        try {
          const result = await callback(tx);
          committed = true;
          calls.push('transaction.commit');
          return result;
        } catch (error) {
          records.length = 0;
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
    bootstrapInactiveLabAdmin(fake.adapter),
    /BOOTSTRAP_NOT_AUTHORIZED/,
  );

  assert.deepEqual(fake.calls, []);
});

test('refus sans tenant initial', async () => {
  const fake = fakePrisma({ missingInitial: true });

  await assert.rejects(
    bootstrapInactiveLabAdmin(
      fake.adapter, { permit: true },
    ),
    /INITIAL_TENANT_NOT_VERIFIED/,
  );

  assert.equal(fake.committed, false);
});

test('refus sans laboratoire', async () => {
  const fake = fakePrisma({ missingLab: true });

  await assert.rejects(
    bootstrapInactiveLabAdmin(
      fake.adapter, { permit: true },
    ),
    /INACTIVE_LAB_NOT_VERIFIED/,
  );
});

test('refus si laboratoire actif', async () => {
  const fake = fakePrisma({ activeLab: true });

  await assert.rejects(
    bootstrapInactiveLabAdmin(
      fake.adapter, { permit: true },
    ),
    /INACTIVE_LAB_NOT_VERIFIED/,
  );
});

test('refus des utilisateurs deja presents', async () => {
  const fake = fakePrisma({ existingUser: true });

  await assert.rejects(
    bootstrapInactiveLabAdmin(
      fake.adapter, { permit: true },
    ),
    /LAB_BOOTSTRAP_ALREADY_INITIALIZED/,
  );

  assert.equal(
    fake.calls.includes('role.create'),
    false,
  );
});

test('refus si permission absente', async () => {
  const fake = fakePrisma({
    missingPermission: true,
  });

  await assert.rejects(
    bootstrapInactiveLabAdmin(
      fake.adapter, { permit: true },
    ),
    /LAB_PERMISSION_MISSING/,
  );

  assert.equal(
    fake.calls.includes('role.create'),
    false,
  );
});

test('creation inactive et audit atomique', async () => {
  const fake = fakePrisma();

  const result = await bootstrapInactiveLabAdmin(
    fake.adapter, { permit: true },
  );

  assert.equal(
    result.status,
    'INACTIVE_ADMIN_BOOTSTRAPPED',
  );
  assert.equal(result.tenantId, LAB_ID);
  assert.equal(result.accountActive, false);
  assert.equal(result.tenantActive, false);
  assert.equal(result.roleSystem, false);
  assert.equal(result.activationAllowed, false);
  assert.equal(fake.committed, true);

  assert.deepEqual(
    fake.records.map(item => item.type),
    ['role', 'user', 'audit'],
  );
});

test('echec de l audit : rollback demande', async () => {
  const fake = fakePrisma({ failAudit: true });

  await assert.rejects(
    bootstrapInactiveLabAdmin(
      fake.adapter, { permit: true },
    ),
    /SIMULATED_AUDIT_FAILURE/,
  );

  assert.equal(fake.committed, false);
  assert.deepEqual(fake.records, []);
});

test('postcondition utilisateur invalide : rollback', async () => {
  const fake = fakePrisma({ badAccount: true });

  await assert.rejects(
    bootstrapInactiveLabAdmin(
      fake.adapter, { permit: true },
    ),
    /LAB_ACCOUNT_POSTCONDITION_FAILED/,
  );

  assert.equal(fake.committed, false);
  assert.deepEqual(fake.records, []);
});
