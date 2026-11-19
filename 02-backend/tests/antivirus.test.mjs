import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const buildDir = process.env.OPENCRISIS_TEST_BUILD_DIR;

if (!buildDir) {
  throw new Error(
    'OPENCRISIS_TEST_BUILD_DIR requis'
  );
}

const {
  scanUploadFile,
  AntivirusError,
} = require(path.join(
  buildDir,
  'services',
  'antivirus.js',
));

async function fixture(content) {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'opencrisis-av-')
  );

  const filename = path.join(dir, 'sample.bin');

  await fs.writeFile(filename, content);

  return {
    filename,
    async cleanup() {
      await fs.rm(dir, {
        recursive: true,
        force: true,
      });
    },
  };
}

async function mockClamd(reply) {
  const server = net.createServer((socket) => {
    let data = Buffer.alloc(0);

    socket.on('data', (chunk) => {
      data = Buffer.concat([data, chunk]);

      const prefix = Buffer.from('zINSTREAM\0');

      if (data.length < prefix.length) return;

      if (!data.subarray(0, prefix.length).equals(prefix)) {
        socket.destroy();
        return;
      }

      let offset = prefix.length;

      while (offset + 4 <= data.length) {
        const length = data.readUInt32BE(offset);

        if (length === 0) {
          socket.end(reply + '\0');
          return;
        }

        if (offset + 4 + length > data.length) return;

        offset += 4 + length;
      }
    });
  });

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();

  return {
    port: address.port,
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}

async function scanWithMock(content, reply) {
  const file = await fixture(content);
  const mock = await mockClamd(reply);

  process.env.CLAMAV_HOST = '127.0.0.1';
  process.env.CLAMAV_PORT = String(mock.port);

  try {
    return await scanUploadFile(file.filename);
  } finally {
    await mock.close();
    await file.cleanup();
  }
}

test('ClamAV accepte un verdict sain', async () => {
  await assert.doesNotReject(
    scanWithMock(
      Buffer.from('document sain'),
      'stream: OK',
    ),
  );
});

test('ClamAV bloque un verdict infecté', async () => {
  await assert.rejects(
    scanWithMock(
      Buffer.from('simulation'),
      'stream: Test-Signature FOUND',
    ),
    (error) =>
      error instanceof AntivirusError &&
      error.status === 422,
  );
});

test('ClamAV refuse un résultat inconnu', async () => {
  await assert.rejects(
    scanWithMock(
      Buffer.from('simulation'),
      'stream: ERROR',
    ),
    (error) =>
      error instanceof AntivirusError &&
      error.status === 503,
  );
});

test('ClamAV refuse une configuration invalide', async () => {
  const file = await fixture('simulation');

  process.env.CLAMAV_HOST = '127.0.0.1';
  process.env.CLAMAV_PORT = '99999';

  try {
    await assert.rejects(
      scanUploadFile(file.filename),
      (error) =>
        error instanceof AntivirusError &&
        error.status === 503,
    );
  } finally {
    await file.cleanup();
  }
});

test('ClamAV refuse une connexion indisponible', async () => {
  const server = net.createServer();

  await new Promise((resolve) =>
    server.listen(0, '127.0.0.1', resolve)
  );

  const port = server.address().port;

  await new Promise((resolve) => server.close(resolve));

  const file = await fixture('simulation');

  process.env.CLAMAV_HOST = '127.0.0.1';
  process.env.CLAMAV_PORT = String(port);

  try {
    await assert.rejects(
      scanUploadFile(file.filename),
      (error) =>
        error instanceof AntivirusError &&
        error.status === 503,
    );
  } finally {
    await file.cleanup();
  }
});
