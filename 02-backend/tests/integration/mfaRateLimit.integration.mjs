import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

if (process.env.OPENCRISIS_INTEGRATION_TEST !== '1') {
  throw new Error('Laboratoire requis');
}

if (!process.env.DATABASE_URL?.includes('opencrisis_ci')) {
  throw new Error('Base de test requise');
}

const dist = process.env.OPENCRISIS_TEST_BUILD_DIR;

if (!dist) throw new Error('Build requis');

const { PrismaClient } = require('@prisma/client');

const {
  consumeMfaAttempt,
} = require(path.join(dist, 'services/mfaRateLimit.js'));

const bcrypt = require('bcryptjs');
const {
  beginTotpEnrollment,
  enableTotp,
  disableTotp,
} = require(path.join(dist, 'services/totpAccount.js'));

const prisma = new PrismaClient();

test(
  'MFA : limite atomique et fenetre de renouvellement',
  { timeout: 20000 },
  async () => {
    const id = randomUUID();
    const password = 'Test-Only-MFA-Password-2026!';

    try {
      await prisma.user.create({
        data: {
          id,
          email: `limit-${id}@integration.invalid`,
          passwordHash: await bcrypt.hash(password, 12),
          firstName: 'Test',
          lastName: 'RateLimit',
        },
      });

      // 20 tentatives simultanées, réparties
      // potentiellement entre plusieurs instances.
      const results = await Promise.allSettled(
        Array.from(
          { length: 20 },
          () => consumeMfaAttempt(id),
        ),
      );

      const accepted = results.filter(
        result => result.status === 'fulfilled',
      );

      const refused = results.filter(
        result => result.status === 'rejected',
      );

      assert.equal(accepted.length, 10);
      assert.equal(refused.length, 10);

      const bucket =
        await prisma.mfaAttemptBucket.findUniqueOrThrow({
          where: { userId: id },
        });

      assert.equal(bucket.attempts, 20);

      // Simuler l'expiration de la fenêtre sans
      // faire attendre quinze minutes.
      await prisma.mfaAttemptBucket.update({
        where: { userId: id },
        data: {
          resetAt: new Date(Date.now() - 60000),
        },
      });

      await assert.doesNotReject(
        consumeMfaAttempt(id),
      );

      const renewed =
        await prisma.mfaAttemptBucket.findUniqueOrThrow({
          where: { userId: id },
        });

      assert.equal(renewed.attempts, 1);
      assert.ok(renewed.resetAt > new Date());


      // Verifier que l'activation compte les codes incorrects.
      await beginTotpEnrollment(id, password);

      await assert.rejects(
        enableTotp(id, 'invalid'),
      );

      // Verifier que la desactivation exige un code
      // et consomme aussi une tentative MFA.
      await assert.rejects(
        disableTotp(id, password, 'invalid'),
      );

      const afterOperations =
        await prisma.mfaAttemptBucket.findUniqueOrThrow({
          where: { userId: id },
        });

      assert.equal(
        afterOperations.attempts,
        3,
        'Les operations TOTP doivent etre limitees',
      );

    } finally {
      await prisma.mfaAttemptBucket.deleteMany({
        where: { userId: id },
      });

      await prisma.totpCredential.deleteMany({
        where: { userId: id },
      });

      await prisma.user.deleteMany({
        where: { id },
      });

      await prisma.$disconnect();
    }
  },
);
