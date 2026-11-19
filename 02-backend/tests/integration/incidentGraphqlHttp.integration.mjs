import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const dist = process.env.OPENCRISIS_TEST_BUILD_DIR;
const url = process.env.DATABASE_URL;

if (
  !dist ||
  process.env.OPENCRISIS_INTEGRATION_TEST !== '1' ||
  process.env.OPENCRISIS_HTTP_TEST_ISOLATED !== '1' ||
  !url ||
  new URL(url).pathname !== '/opencrisis_ci' ||
  !process.env.JWT_SECRET
) {
  throw new Error('Laboratoire GraphQL HTTP isole requis');
}

const express = require('express');
const jwt = require('jsonwebtoken');
const { graphql } = require('graphql');
const { makeExecutableSchema } = require('@graphql-tools/schema');

const { prisma } = require(path.join(dist, 'prisma.js'));
const { incidentResolvers } = require(
  path.join(dist, 'resolvers/incident.js')
);
const { incidentTypeDefs } = require(
  path.join(dist, 'schema/incident.js')
);
const { verifyActiveAccessToken } = require(
  path.join(dist, 'middleware/auth.js')
);
const { pubsub } = require(path.join(dist, 'pubsub.js'));

const schema = makeExecutableSchema({
  typeDefs: [
    'type Query { _health: Boolean }',
    'type Mutation { _health: Boolean }',
    'type User { id: ID! }',
    incidentTypeDefs,
  ],
  resolvers: incidentResolvers,
});

function context(userId) {
  return { userId, req: null, res: null };
}

async function makeAccount(tenantId, label, grants) {
  const id = randomUUID();

  const user = await prisma.user.create({
    data: {
      id,
      tenantId,
      email: `${label}-${id}@integration.invalid`,
      passwordHash: 'integration-only',
      firstName: 'Test',
      lastName: label,
      mustChangePassword: false,
    },
  });

  const role = await prisma.role.create({
    data: {
      tenantId,
      name: `${label}-${randomUUID()}`,
      isSystem: false,
    },
  });

  await prisma.roleAssignment.create({
    data: { userId: user.id, roleId: role.id },
  });

  for (const [resource, action] of grants) {
    const permission = await prisma.permission.upsert({
      where: {
        resource_action: { resource, action },
      },
      update: {},
      create: { resource, action },
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

  return { user, token };
}

async function startHttp() {
  const app = express();
  app.use(express.json());

  app.post('/api/graphql', async (req, res) => {
    try {
      const authorization = req.headers.authorization;
      const token = authorization?.startsWith('Bearer ')
        ? authorization.slice(7)
        : null;

      const payload = token
        ? await verifyActiveAccessToken(token)
        : null;

      const result = await graphql({
        schema,
        source: req.body.query,
        variableValues: req.body.variables,
        contextValue: {
          ...context(payload?.userId ?? null),
          req,
          res,
        },
      });

      res.set('Cache-Control', 'no-store');
      res.json(result);
    } catch {
      res.status(500).json({
        errors: [{
          message: 'Erreur interne',
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        }],
      });
    }
  });

  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => {
      resolve(instance);
    });
  });

  return {
    server,
    address: `http://127.0.0.1:${server.address().port}/api/graphql`,
  };
}

async function request(address, token, query, variables = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(address, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(10000),
  });

  assert.equal(response.status, 200);
  return response.json();
}

function expectError(result, code) {
  assert.ok(result.errors?.length, JSON.stringify(result));
  assert.equal(
    result.errors[0].extensions?.code,
    code,
    JSON.stringify(result)
  );
}

function expectSuccess(result) {
  assert.equal(result.errors, undefined, JSON.stringify(result));
  assert.ok(result.data);
  return result.data;
}

const READ = `query($id: ID!) {
  incident(id: $id) { id name status }
}`;

const LIST = `query {
  incidents { id name }
}`;

const CREATE = `mutation($input: CreateIncidentInput!) {
  createIncident(input: $input) { id name }
}`;

const UPDATE = `mutation($id: ID!, $input: UpdateIncidentInput!) {
  updateIncident(id: $id, input: $input) { id name }
}`;

const DELETE = `mutation($id: ID!) {
  deleteIncident(id: $id)
}`;

test(
  'GraphQL HTTP : permissions RBAC et isolation des incidents',
  { timeout: 45000 },
  async t => {
    const suffix = randomUUID();
    const tenantA = randomUUID();
    const tenantB = randomUUID();

    let server;

    try {
      await prisma.tenant.createMany({
        data: [
          {
            id: tenantA,
            name: 'Tenant GraphQL A',
            slug: `graphql-a-${suffix}`,
          },
          {
            id: tenantB,
            name: 'Tenant GraphQL B',
            slug: `graphql-b-${suffix}`,
          },
        ],
      });

      const writerA = await makeAccount(
        tenantA, 'writer-a',
        [['DASHBOARD', 'READ'], ['DASHBOARD', 'WRITE']]
      );

      const readerA = await makeAccount(
        tenantA, 'reader-a',
        [['DASHBOARD', 'READ']]
      );

      const adminA = await makeAccount(
        tenantA, 'admin-a',
        [['DASHBOARD', 'READ'], ['ADMIN', 'WRITE']]
      );

      const writerB = await makeAccount(
        tenantB, 'writer-b',
        [['DASHBOARD', 'READ'], ['DASHBOARD', 'WRITE']]
      );

      const incidentA = await prisma.incident.create({
        data: {
          tenantId: tenantA,
          createdById: writerA.user.id,
          name: 'Incident prive A',
        },
      });

      const incidentB = await prisma.incident.create({
        data: {
          tenantId: tenantB,
          createdById: writerB.user.id,
          name: 'Incident prive B',
        },
      });

      const http = await startHttp();
      server = http.server;
      const address = http.address;

      await t.test('Anonyme refuse', async () => {
        expectError(
          await request(address, null, LIST),
          'UNAUTHENTICATED'
        );
      });

      await t.test('Lecture dans son organisation', async () => {
        const result = expectSuccess(
          await request(
            address, readerA.token, READ,
            { id: incidentA.id }
          )
        );
        assert.equal(result.incident.id, incidentA.id);
      });

      await t.test('Lecture inter-tenant refusee', async () => {
        expectError(
          await request(
            address, writerA.token, READ,
            { id: incidentB.id }
          ),
          'NOT_FOUND'
        );
      });

      await t.test('Liste filtree par organisation', async () => {
        const result = expectSuccess(
          await request(address, readerA.token, LIST)
        );

        const ids = result.incidents.map(i => i.id);
        assert.ok(ids.includes(incidentA.id));
        assert.ok(!ids.includes(incidentB.id));
      });

      await t.test('Lecteur interdit de creation', async () => {
        expectError(
          await request(address, readerA.token, CREATE, {
            input: { name: 'Creation interdite' },
          }),
          'FORBIDDEN'
        );
      });

      await t.test('Ecrivain autorise a creer', async () => {
        const result = expectSuccess(
          await request(address, writerA.token, CREATE, {
            input: { name: 'Creation autorisee A' },
          })
        );

        const stored = await prisma.incident.findUnique({
          where: { id: result.createIncident.id },
        });
        assert.equal(stored.tenantId, tenantA);
      });

      await t.test('Ecriture inter-tenant refusee', async () => {
        expectError(
          await request(address, writerA.token, UPDATE, {
            id: incidentB.id,
            input: { name: 'Modification interdite' },
          }),
          'NOT_FOUND'
        );

        const stored = await prisma.incident.findUnique({
          where: { id: incidentB.id },
        });
        assert.equal(stored.name, 'Incident prive B');
      });

      await t.test('Lecteur interdit de modification', async () => {
        expectError(
          await request(address, readerA.token, UPDATE, {
            id: incidentA.id,
            input: { name: 'Modification interdite' },
          }),
          'FORBIDDEN'
        );
      });

      await t.test('Ecrivain sans ADMIN interdit de suppression', async () => {
        expectError(
          await request(address, writerA.token, DELETE, {
            id: incidentA.id,
          }),
          'FORBIDDEN'
        );
      });

      await t.test('ADMIN ne peut supprimer chez B', async () => {
        expectError(
          await request(address, adminA.token, DELETE, {
            id: incidentB.id,
          }),
          'NOT_FOUND'
        );
      });

      await t.test('ADMIN peut supprimer chez A', async () => {
        const result = expectSuccess(
          await request(address, adminA.token, DELETE, {
            id: incidentA.id,
          })
        );

        assert.equal(result.deleteIncident, true);

        const stored = await prisma.incident.findUnique({
          where: { id: incidentA.id },
        });

        assert.ok(stored.deletedAt);
      });

      await t.test('Mot de passe temporaire bloque les droits', async () => {
        await prisma.user.update({
          where: { id: readerA.user.id },
          data: { mustChangePassword: true },
        });

        expectError(
          await request(address, readerA.token, LIST),
          'PASSWORD_CHANGE_REQUIRED'
        );
      });

      await t.test('Organisation desactivee refusee', async () => {
        await prisma.tenant.update({
          where: { id: tenantB },
          data: { isActive: false },
        });

        expectError(
          await request(address, writerB.token, LIST),
          'FORBIDDEN'
        );
      });
    } finally {
      try {
        if (server) {
          await new Promise((resolve, reject) => {
            server.close(error => error ? reject(error) : resolve());
          });
        }
      } finally {
        try {
          await pubsub.close();
        } finally {
          await prisma.$disconnect();
        }
      }
    }
  }
);
