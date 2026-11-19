import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';

const require = createRequire(import.meta.url);
const dist = process.env.OPENCRISIS_TEST_BUILD_DIR;
const databaseUrl = process.env.DATABASE_URL;

if (
  !dist ||
  process.env.OPENCRISIS_INTEGRATION_TEST !== '1' ||
  process.env.OPENCRISIS_HTTP_TEST_ISOLATED !== '1' ||
  !databaseUrl ||
  new URL(databaseUrl).pathname !== '/opencrisis_ci' ||
  !process.env.JWT_SECRET
) {
  throw new Error('Laboratoire Apollo isole obligatoire');
}

const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const prisma = new PrismaClient();

async function getFreePort() {
  const server = net.createServer();

  await new Promise(resolve =>
    server.listen(0, '127.0.0.1', resolve)
  );

  const port = server.address().port;

  await new Promise(resolve => server.close(resolve));

  return port;
}

function startBackend(port) {
  const child = spawn(
    process.execPath,
    [path.join(dist, 'server.js')],
    {
      cwd: path.dirname(dist),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: String(port),
        CORS_ORIGIN: 'http://localhost:5173',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  let logs = '';

  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', chunk => {
      logs = (logs + chunk.toString()).slice(-12000);
    });
  }

  return { child, getLogs: () => logs };
}

async function waitForHealth(baseUrl, child, getLogs) {
  const deadline = Date.now() + 15000;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        'Backend arrete pendant le demarrage:\n' + getLogs()
      );
    }

    try {
      const response = await fetch(`${baseUrl}/health`, {
        signal: AbortSignal.timeout(1000),
      });

      if (response.ok) {
        const body = await response.json();

        assert.equal(body.status, 'ok');
        assert.equal(body.service, 'opencrisis-backend');

        return;
      }
    } catch {
      // Le serveur est encore en cours de demarrage.
    }

    await new Promise(resolve => setTimeout(resolve, 150));
  }

  throw new Error(
    'Backend non disponible apres demarrage:\n' + getLogs()
  );
}

async function stopBackend(child) {
  if (child.exitCode !== null) return;

  const exited = new Promise(resolve => {
    child.once('exit', resolve);
  });

  child.kill('SIGTERM');

  const result = await Promise.race([
    exited.then(() => 'exited'),
    new Promise(resolve =>
      setTimeout(() => resolve('timeout'), 5000)
    ),
  ]);

  if (result === 'timeout') {
    child.kill('SIGKILL');
    await exited;
  }
}

async function gql(baseUrl, query, token, variables) {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(
    `${baseUrl}/api/graphql`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(10000),
    }
  );

  const body = await response.json();

  assert.match(
    response.headers.get('cache-control') || '',
    /no-store/
  );

  return { response, body };
}

function expectError(result, code) {
  assert.ok(result.body.errors?.length, JSON.stringify(result.body));
  assert.equal(
    result.body.errors[0].extensions?.code,
    code,
    JSON.stringify(result.body)
  );
}

async function createUser(tenantId, suffix, readAccess) {
  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      tenantId,
      email: `apollo-${suffix}-${randomUUID()}@integration.invalid`,
      passwordHash: 'integration-only',
      firstName: 'Test',
      lastName: suffix,
      mustChangePassword: false,
    },
  });

  const role = await prisma.role.create({
    data: {
      tenantId,
      name: `apollo-${suffix}-${randomUUID()}`,
      isSystem: false,
    },
  });

  await prisma.roleAssignment.create({
    data: { userId: user.id, roleId: role.id },
  });

  if (readAccess) {
    const permission = await prisma.permission.upsert({
      where: {
        resource_action: {
          resource: 'DASHBOARD',
          action: 'READ',
        },
      },
      update: {},
      create: {
        resource: 'DASHBOARD',
        action: 'READ',
      },
    });

    await prisma.rolePermission.create({
      data: {
        roleId: role.id,
        permissionId: permission.id,
      },
    });
  }

  const session = await prisma.authSession.create({
    data: {
      userId: user.id,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });

  const token = jwt.sign(
    {
      userId: user.id,
      email: user.email,
      sessionVersion: user.sessionVersion,
      sessionId: session.id,
    },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '15m' }
  );

  return { user, token, session };
}

test(
  'Apollo reel : HTTP, JWT, RBAC et isolation des incidents',
  { timeout: 60000 },
  async t => {
    let backend;

    try {
      const suffix = randomUUID();
      const tenantA = randomUUID();
      const tenantB = randomUUID();

      await prisma.tenant.createMany({
        data: [
          {
            id: tenantA,
            name: 'Apollo entreprise A',
            slug: `apollo-a-${suffix}`,
          },
          {
            id: tenantB,
            name: 'Apollo entreprise B',
            slug: `apollo-b-${suffix}`,
          },
        ],
      });

      const readerA = await createUser(tenantA, 'reader-a', true);
      const noAccessA = await createUser(tenantA, 'no-access-a', false);
      const readerB = await createUser(tenantB, 'reader-b', true);

      const incidentA = await prisma.incident.create({
        data: {
          name: 'Incident prive Apollo A',
          tenantId: tenantA,
          createdById: readerA.user.id,
        },
      });

      const incidentB = await prisma.incident.create({
        data: {
          name: 'Incident prive Apollo B',
          tenantId: tenantB,
          createdById: readerB.user.id,
        },
      });

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;

      backend = startBackend(port);

      await waitForHealth(
        baseUrl,
        backend.child,
        backend.getLogs
      );

      await t.test('Health du vrai serveur', async () => {
        const response = await fetch(`${baseUrl}/health`);
        const body = await response.json();

        assert.equal(response.status, 200);
        assert.equal(body.status, 'ok');
      });

      await t.test('Apollo execute GraphQL', async () => {
        const result = await gql(baseUrl, '{ __typename }');

        assert.equal(result.response.status, 200);
        assert.equal(result.body.data.__typename, 'Query');
      });

      await t.test('Anonyme refuse', async () => {
        const result = await gql(baseUrl, '{ incidents { id } }');
        expectError(result, 'UNAUTHENTICATED');
      });

      await t.test('Jeton invalide refuse', async () => {
        const result = await gql(
          baseUrl,
          '{ incidents { id } }',
          'jeton-invalide'
        );

        expectError(result, 'UNAUTHENTICATED');
      });

      await t.test('RBAC sans READ refuse', async () => {
        const result = await gql(
          baseUrl,
          '{ incidents { id } }',
          noAccessA.token
        );

        expectError(result, 'FORBIDDEN');
      });

      await t.test('Tenant A ne voit pas B', async () => {
        const result = await gql(
          baseUrl,
          '{ incidents { id name } }',
          readerA.token
        );

        assert.ok(!result.body.errors, JSON.stringify(result.body));

        const ids = result.body.data.incidents.map(i => i.id);

        assert.ok(ids.includes(incidentA.id));
        assert.ok(!ids.includes(incidentB.id));
      });

      await t.test('Identifiant de B inaccessible depuis A', async () => {
        const result = await gql(
          baseUrl,
          'query($id: ID!) { incident(id: $id) { id name } }',
          readerA.token,
          { id: incidentB.id }
        );

        expectError(result, 'NOT_FOUND');
      });

      await t.test('Session revoquee refusee', async () => {
        await prisma.authSession.update({
          where: { id: readerA.session.id },
          data: { revokedAt: new Date() },
        });

        const result = await gql(
          baseUrl,
          '{ incidents { id } }',
          readerA.token
        );

        expectError(result, 'UNAUTHENTICATED');
      });

      await t.test('Utilisateur B ne voit pas A', async () => {
        const result = await gql(
          baseUrl,
          '{ incidents { id } }',
          readerB.token
        );

        assert.ok(!result.body.errors, JSON.stringify(result.body));

        const ids = result.body.data.incidents.map(i => i.id);

        assert.ok(ids.includes(incidentB.id));
        assert.ok(!ids.includes(incidentA.id));
      });

      console.log(
        'PASS : vrai serveur Apollo, JWT, revocation, RBAC, tenants'
      );
    } finally {
      try {
        if (backend) {
          await stopBackend(backend.child);
        }
      } finally {
        await prisma.$disconnect();
      }
    }
  }
);
