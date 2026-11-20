import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import fs from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);

const dist = process.env.OPENCRISIS_TEST_BUILD_DIR;

if (
  !dist ||
  process.env.OPENCRISIS_INTEGRATION_TEST !== '1' ||
  !process.env.DATABASE_URL?.includes('opencrisis_ci') ||
  process.env.OPENCRISIS_HTTP_TEST_ISOLATED !== '1'
) {
  throw new Error(
    'Test HTTP reserve au laboratoire PostgreSQL isole'
  );
}

const express = require('express');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const filesRouter = require(
  path.join(dist, 'routes/files.js')
).default;

const prisma = new PrismaClient();

const { pubsub } = require(
  path.join(dist, 'pubsub.js')
);

const UPLOADS = '/app/uploads';

function startApp() {
  const app = express();
  app.use('/files', filesRouter);

  return new Promise(resolve => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();

      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close(error => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function startScanner() {
  const state = { verdict: 'stream: OK' };

  const server = net.createServer(socket => {
    let received = Buffer.alloc(0);
    let finished = false;

    socket.on('data', chunk => {
      if (finished) return;

      received = Buffer.concat([received, chunk]);

      const prefix = Buffer.from('zINSTREAM\0');

      if (received.length < prefix.length) return;

      if (!received.subarray(0, prefix.length).equals(prefix)) {
        finished = true;
        socket.destroy();
        return;
      }

      let offset = prefix.length;

      while (offset + 4 <= received.length) {
        const size = received.readUInt32BE(offset);

        if (size === 0) {
          finished = true;
          socket.end(state.verdict + '\0');
          return;
        }

        if (offset + 4 + size > received.length) return;

        offset += 4 + size;
      }
    });
  });

  await new Promise(resolve => {
    server.listen(0, '127.0.0.1', resolve);
  });

  return {
    server,
    state,
    port: server.address().port,
  };
}

function accessToken(user, session) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      sessionVersion: user.sessionVersion,
      sessionId: session.id,
    },
    process.env.JWT_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: '15m',
    }
  );
}

async function makeUser(tenantId, suffix, grantDocuments) {
  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      tenantId,
      email: `upload-${suffix}-${randomUUID()}@integration.invalid`,
      passwordHash: 'integration-test-not-for-login',
      firstName: 'Test',
      lastName: suffix,
      isActive: true,
      mustChangePassword: false,
    },
  });

  const role = await prisma.role.create({
    data: {
      id: randomUUID(),
      tenantId,
      name: `upload-role-${randomUUID()}`,
      isSystem: false,
    },
  });

  await prisma.roleAssignment.create({
    data: {
      userId: user.id,
      roleId: role.id,
    },
  });

  if (grantDocuments) {
    const permission = await prisma.permission.upsert({
      where: {
        resource_action: {
          resource: 'DOCUMENTS',
          action: 'WRITE',
        },
      },
      update: {},
      create: {
        resource: 'DOCUMENTS',
        action: 'WRITE',
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

  return {
    user,
    token: accessToken(user, session),
  };
}

async function upload(
  baseUrl,
  token,
  incidentId,
  fileContent = Buffer.from('contenu de test HTTP')
) {
  const form = new FormData();

  form.append('category', 'OTHER');

  if (incidentId) {
    form.append('incidentId', incidentId);
  }

  form.append(
    'file',
    new Blob([fileContent], {
      type: 'text/plain',
    }),
    'integration-test.txt'
  );

  const headers = {};

  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  return fetch(`${baseUrl}/files/upload`, {
    method: 'POST',
    headers,
    body: form,
  });
}

async function temporaryFiles() {
  try {
    return (await fs.readdir(path.join(UPLOADS, 'tmp')))
      .sort();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

test(
  'HTTP uploads : auth, permissions, AV, nettoyage et tenants',
  { timeout: 45000 },
  async () => {
    const tenantAId = randomUUID();
    const tenantBId = randomUUID();

    const scanner = await startScanner();

    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = String(scanner.port);

    let app;

    try {
      await prisma.tenant.createMany({
        data: [
          {
            id: tenantAId,
            name: 'Upload test A',
            slug: `upload-a-${tenantAId}`,
          },
          {
            id: tenantBId,
            name: 'Upload test B',
            slug: `upload-b-${tenantBId}`,
          },
        ],
      });

      const allowed = await makeUser(
        tenantAId, 'allowed', true
      );

      const denied = await makeUser(
        tenantAId, 'denied', false
      );

      const userB = await makeUser(
        tenantBId, 'tenant-b', true
      );

      const foreignIncident = await prisma.incident.create({
        data: {
          tenantId: tenantBId,
          name: 'Incident entreprise B',
          createdById: userB.user.id,
        },
      });

      app = await startApp();

      const baseUrl = app.baseUrl;

      const initialFiles = await temporaryFiles();

      // Sans authentification : aucun upload.
      let response = await upload(baseUrl, null);
      assert.equal(response.status, 401);

      // Sans DOCUMENTS:WRITE : refus.
      response = await upload(baseUrl, denied.token);
      assert.equal(response.status, 403);

      // Depassement de la limite Multer : HTTP 413.
      const oversizedFile = Buffer.alloc(
        20 * 1024 * 1024 + 1,
        0x41
      );

      response = await upload(
        baseUrl,
        allowed.token,
        undefined,
        oversizedFile
      );

      assert.equal(response.status, 413);

      assert.equal(
        await prisma.document.count({
          where: { tenantId: tenantAId },
        }),
        0,
        'Aucun document ne doit etre cree apres HTTP 413'
      );

      assert.deepEqual(
        await temporaryFiles(),
        initialFiles,
        'Aucun fichier temporaire apres HTTP 413'
      );

      console.log(
        'PASS : HTTP 413, aucun document, aucun fichier temporaire'
      );

      // Une alerte de malware provoque HTTP 422.
      scanner.state.verdict = 'stream: Test FOUND';

      response = await upload(baseUrl, allowed.token);
      assert.equal(response.status, 422);

      assert.equal(
        await prisma.document.count({
          where: { tenantId: tenantAId },
        }),
        0
      );

      assert.deepEqual(
        await temporaryFiles(),
        initialFiles,
        'Le fichier infecte doit etre supprime'
      );

      // Le tenant A ne peut pas deposer sur un incident B.
      scanner.state.verdict = 'stream: OK';

      response = await upload(
        baseUrl,
        allowed.token,
        foreignIncident.id
      );

      assert.notEqual(response.status, 201);

      assert.equal(
        await prisma.document.count({
          where: { tenantId: tenantAId },
        }),
        0
      );

      assert.deepEqual(
        await temporaryFiles(),
        initialFiles
      );

      // Un fichier sain et autorise est enregistre.
      response = await upload(baseUrl, allowed.token);
      assert.equal(response.status, 201);

      const document = await response.json();

      assert.equal(document.tenantId, tenantAId);

      assert.equal(
        await prisma.document.count({
          where: { tenantId: tenantAId },
        }),
        1
      );

      const saved = await prisma.document.findUnique({
        where: { id: document.id },
      });

      assert.ok(saved);
      assert.ok(saved.filePath.startsWith('global/'));

      const physicalPath = path.join(
        UPLOADS,
        saved.filePath
      );

      assert.equal(
        await fs.readFile(physicalPath, 'utf8'),
        'contenu de test HTTP'
      );

      await fs.unlink(physicalPath);

      // Scanner indisponible : refus ferme HTTP 503.
      await closeServer(scanner.server);

      response = await upload(baseUrl, allowed.token);
      assert.equal(response.status, 503);

      assert.equal(
        await prisma.document.count({
          where: { tenantId: tenantAId },
        }),
        1
      );

      assert.deepEqual(
        await temporaryFiles(),
        initialFiles,
        'Le fichier refuse doit etre supprime'
      );

      console.log(
        'PASS : HTTP 401/403/422/503/201, ' +
        'tenant B refuse, aucun fichier temporaire abandonne'
      );
    } finally {
      if (app) {
        await closeServer(app.server);
      }

      if (scanner.server.listening) {
        await closeServer(scanner.server);
      }

      await pubsub.close();
      await prisma.$disconnect();
    }
  }
);
