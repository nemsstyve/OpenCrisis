import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateWazuhConnectorSecret,
  hashWazuhConnectorSecret,
} from '../src/services/wazuhConnectorCredentials.ts';

// Tester le module JavaScript compile du backend.
// Node 24 ne resout pas les imports relatifs sans extension
// lorsqu'il execute directement les fichiers TypeScript.
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const buildDir = process.env.OPENCRISIS_TEST_BUILD_DIR;

if (!buildDir) {
  throw new Error(
    'OPENCRISIS_TEST_BUILD_DIR requis : compiler le backend avant ce test',
  );
}

const { authenticateWazuhConnector } = require(
  join(buildDir, 'services/wazuhConnectorAuthentication.js'),
);

function fixture(options = {}) {
  const secret = generateWazuhConnectorSecret();
  const hash = hashWazuhConnectorSecret(secret);

  const {
    candidate = { tenantId: 'tenant-a' },
    tenantRows = [{ id: 'tenant-a' }],
    connectorRows = [{
      id: 'connector-a',
      tenantId: 'tenant-a',
      sourceId: 'wazuh-01',
      secretHash: hash,
    }],
  } = options;

  const calls = [];

  const tx = {
    wazuhConnector: {
      async updateMany(args) {
        calls.push('usage');

        assert.equal(args.where.id, 'connector-a');
        assert.equal(args.where.tenantId, 'tenant-a');
        assert.equal(args.where.isActive, true);
        assert.equal(args.where.revokedAt, null);
        assert.ok(args.data.lastUsedAt instanceof Date);

        return { count: 1 };
      },
    },
    async $queryRaw(parts) {
      const sql = parts.join('?');
      const count = calls.filter(x => x === 'lock').length;

      if (count === 0) {
        assert.match(sql, /FOR SHARE/);
      } else {
        assert.match(sql, /FOR UPDATE/);
      }

      calls.push('lock');
      return calls.filter(x => x === 'lock').length === 1
        ? tenantRows
        : connectorRows;
    },
  };

  const prisma = {
    wazuhConnector: {
      async findUnique() {
        calls.push('lookup');
        return candidate;
      },
    },
    async $transaction(callback, settings) {
      calls.push('transaction');
      assert.equal(
        settings.isolationLevel,
        'ReadCommitted',
      );
      return callback(tx);
    },
  };

  return { prisma, secret, hash, calls };
}

test('connecteur valide retourne uniquement son identite', async () => {
  const f = fixture();

  const result = await authenticateWazuhConnector(
    f.prisma, 'connector-a', f.secret,
  );

  assert.deepEqual(result, {
    connectorId: 'connector-a',
    tenantId: 'tenant-a',
    sourceId: 'wazuh-01',
  });

  assert.equal(JSON.stringify(result).includes(f.hash), false);
  assert.equal(JSON.stringify(result).includes(f.secret), false);
  assert.deepEqual(f.calls, [
    'lookup',
    'transaction',
    'lock',
    'lock',
    'usage',
  ]);
});

test('secret incorrect refuse', async () => {
  const f = fixture();

  const result = await authenticateWazuhConnector(
    f.prisma,
    'connector-a',
    generateWazuhConnectorSecret(),
  );

  assert.equal(result, null);
  assert.equal(f.calls.includes('usage'), false);
});

test('secret malforme refuse avant la base', async () => {
  const f = fixture();

  const result = await authenticateWazuhConnector(
    f.prisma,
    'connector-a',
    'password',
  );

  assert.equal(result, null);
  assert.deepEqual(f.calls, []);
});

test('identifiant invalide refuse avant la base', async () => {
  const f = fixture();

  for (const id of ['', ' abc ', null, 15]) {
    assert.equal(
      await authenticateWazuhConnector(
        f.prisma, id, f.secret,
      ),
      null,
    );
  }

  assert.deepEqual(f.calls, []);
});

test('connecteur introuvable refuse', async () => {
  const f = fixture({ candidate: null });

  assert.equal(
    await authenticateWazuhConnector(
      f.prisma, 'missing', f.secret,
    ),
    null,
  );

  assert.deepEqual(f.calls, ['lookup']);
});

test('entreprise inactive refuse', async () => {
  const f = fixture({ tenantRows: [] });

  assert.equal(
    await authenticateWazuhConnector(
      f.prisma, 'connector-a', f.secret,
    ),
    null,
  );
});

test('connecteur revoque ou inactif refuse', async () => {
  const f = fixture({ connectorRows: [] });

  assert.equal(
    await authenticateWazuhConnector(
      f.prisma, 'connector-a', f.secret,
    ),
    null,
  );

  assert.equal(f.calls.includes('usage'), false);
});

test('erreur de base de donnees non masquee', async () => {
  const f = fixture();

  f.prisma.$transaction = async () => {
    throw new Error('Database unavailable');
  };

  await assert.rejects(
    authenticateWazuhConnector(
      f.prisma, 'connector-a', f.secret,
    ),
    /Database unavailable/,
  );
});
