import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);

const dist = process.env.OPENCRISIS_TEST_BUILD_DIR;

if (!dist || process.env.OPENCRISIS_INTEGRATION_TEST !== '1') {
  throw new Error('Test d integration isole requis');
}

if (!process.env.DATABASE_URL?.includes('opencrisis_ci')) {
  throw new Error('Base de test attendue');
}

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const {
  login,
  rotateRefreshToken,
} = require(path.join(dist, 'services/auth.js'));

const {
  beginTotpEnrollment,
  enableTotp,
} = require(path.join(dist, 'services/totpAccount.js'));

const {
  totpCodeAt,
  hashRecoveryCode,
} = require(path.join(dist, 'services/totp.js'));

const prisma = new PrismaClient();

function response() {
  const cookies = new Map();

  return {
    cookies,
    cookie(name, value) {
      cookies.set(name, value);
      return this;
    },
    clearCookie(name) {
      cookies.delete(name);
      return this;
    },
  };
}

test(
  'TOTP : connexion, activation, revocation et recuperation',
  { timeout: 30000 },
  async () => {
    const id = randomUUID();
    const tenantId = randomUUID();
    const email = `totp-${id}@integration.invalid`;
    const password = `Test!${randomUUID()}Aa1`;

    const passwordHash = await bcrypt.hash(password, 12);

    try {
      await prisma.tenant.create({
        data: {
          id: tenantId,
          name: 'Entreprise integration TOTP',
          slug: `integration-totp-${tenantId}`,
        },
      });

      await prisma.user.create({
        data: {
          id,
          tenantId,
          email,
          passwordHash,
          firstName: 'Test',
          lastName: 'TOTP',
          isActive: true,
        },
      });

      // 1. Avant activation : le mot de passe suffit.
      const initialResponse = response();

      const initialLogin = await login(
        email,
        password,
        initialResponse,
        '192.0.2.10',
      );

      assert.ok(initialLogin.accessToken);

      // L'audit est asynchrone : attendre sa persistance
      // au lieu de seulement verifier l'absence d'erreur.
      let loginAudit = null;

      for (let attempt = 0; attempt < 50; attempt++) {
        loginAudit = await prisma.auditLog.findFirst({
          where: {
            userId: id,
            tenantId,
            action: 'LOGIN',
            resource: 'AUTH',
          },
        });

        if (loginAudit) break;

        await new Promise(resolve => setTimeout(resolve, 100));
      }

      assert.ok(
        loginAudit,
        'Le journal de connexion doit etre persiste',
      );

      assert.equal(
        loginAudit.tenantId,
        tenantId,
        'L audit doit appartenir au tenant utilisateur',
      );

      const oldRefreshToken =
        initialResponse.cookies.get('refreshToken');

      assert.ok(oldRefreshToken);

      // 2. Preparation : le secret doit etre chiffre en base.
      const enrollment = await beginTotpEnrollment(
        id,
        password,
      );

      assert.match(enrollment.secret, /^[A-Z2-7]{32}$/);
      assert.match(enrollment.provisioningUri, /^otpauth:/);

      const pending = await prisma.totpCredential.findUniqueOrThrow({
        where: { userId: id },
      });

      assert.ok(pending.pendingSecretCiphertext);
      assert.ok(
        !pending.pendingSecretCiphertext.includes(enrollment.secret)
      );

      // 3. Activation du TOTP.
      const activationCode = totpCodeAt(
        enrollment.secret,
        Date.now(),
      );

      const recoveryCodes = await enableTotp(
        id,
        activationCode,
      );

      assert.equal(recoveryCodes.length, 10);
      assert.equal(new Set(recoveryCodes).size, 10);

      const credential =
        await prisma.totpCredential.findUniqueOrThrow({
          where: { userId: id },
        });

      assert.ok(credential.enabledAt);
      assert.ok(credential.secretCiphertext);
      assert.equal(credential.pendingSecretCiphertext, null);

      const savedRecoveryCodes =
        await prisma.totpRecoveryCode.findMany({
          where: { userId: id },
        });

      assert.equal(savedRecoveryCodes.length, 10);

      for (const code of recoveryCodes) {
        assert.ok(
          savedRecoveryCodes.some(
            (saved) => saved.codeHash === hashRecoveryCode(code)
          )
        );
      }

      // 4. L'ancienne session ne doit plus pouvoir
      // obtenir de nouveau JWT.
      await assert.rejects(
        rotateRefreshToken(
          oldRefreshToken,
          response(),
        ),
      );

      // 5. Le mot de passe seul doit etre refuse.
      const noTotpResponse = response();

      await assert.rejects(
        login(
          email,
          password,
          noTotpResponse,
          '192.0.2.11',
        ),
      );

      assert.equal(
        noTotpResponse.cookies.has('refreshToken'),
        false,
      );

      // 6. Un code TOTP deja consomme lors de
      // l'activation ne doit pas etre reutilisable.
      const replayResponse = response();

      await assert.rejects(
        login(
          email,
          password,
          replayResponse,
          '192.0.2.12',
          activationCode,
        ),
      );

      assert.equal(
        replayResponse.cookies.has('refreshToken'),
        false,
      );

      // 7. Un code de recuperation permet
      // une connexion unique.
      const recovery = recoveryCodes[0];

      const recoveredResponse = response();

      const recovered = await login(
        email,
        password,
        recoveredResponse,
        '192.0.2.13',
        recovery,
      );

      assert.ok(recovered.accessToken);
      assert.ok(
        recoveredResponse.cookies.get('refreshToken')
      );

      const consumed =
        await prisma.totpRecoveryCode.findUniqueOrThrow({
          where: {
            codeHash: hashRecoveryCode(recovery),
          },
        });

      assert.ok(consumed.usedAt);

      // 8. Deuxieme usage du meme code interdit.
      const replayRecoveryResponse = response();

      await assert.rejects(
        login(
          email,
          password,
          replayRecoveryResponse,
          '192.0.2.14',
          recovery,
        ),
      );

      assert.equal(
        replayRecoveryResponse.cookies.has('refreshToken'),
        false,
      );


      // CONCURRENCE : deux connexions avec le
      // meme code de recuperation.
      const simultaneousCode = recoveryCodes[1];
      const simultaneousResponses = [
        response(),
        response(),
      ];

      const simultaneous = await Promise.allSettled([
        login(
          email,
          password,
          simultaneousResponses[0],
          '192.0.2.21',
          simultaneousCode,
        ),
        login(
          email,
          password,
          simultaneousResponses[1],
          '192.0.2.22',
          simultaneousCode,
        ),
      ]);

      assert.equal(
        simultaneous.filter(x => x.status === 'fulfilled').length,
        1,
        'Une seule connexion concurrente doit reussir',
      );

      assert.equal(
        simultaneous.filter(x => x.status === 'rejected').length,
        1,
        'La seconde connexion doit etre refusee',
      );

      for (let index = 0; index < 2; index++) {
        const hasCookie = simultaneousResponses[index]
          .cookies.has('refreshToken');

        assert.equal(
          hasCookie,
          simultaneous[index].status === 'fulfilled',
          'Aucun cookie pour la connexion refusee',
        );
      }

      const usedSimultaneousCode =
        await prisma.totpRecoveryCode.findUniqueOrThrow({
          where: {
            codeHash: hashRecoveryCode(simultaneousCode),
          },
        });

      assert.ok(
        usedSimultaneousCode.usedAt,
        'Le code doit etre marque consomme',
      );


      // Deux authentifications simultanees avec
      // le meme code TOTP doivent etre exclusives.
      // Le pas suivant est autorise par la tolerance
      // de 30 secondes, sans attendre en temps reel.
      const nextTotpCode = totpCodeAt(
        enrollment.secret,
        Date.now() + 30000,
      );

      const totpResponses = [response(), response()];

      const concurrentTotp = await Promise.allSettled([
        login(
          email,
          password,
          totpResponses[0],
          '192.0.2.31',
          nextTotpCode,
        ),
        login(
          email,
          password,
          totpResponses[1],
          '192.0.2.32',
          nextTotpCode,
        ),
      ]);

      assert.equal(
        concurrentTotp.filter(x => x.status === 'fulfilled').length,
        1,
        'Le meme code TOTP ne doit creer qu une session',
      );

      assert.equal(
        concurrentTotp.filter(x => x.status === 'rejected').length,
        1,
        'La deuxieme connexion TOTP doit etre rejetee',
      );

      for (let index = 0; index < 2; index++) {
        assert.equal(
          totpResponses[index].cookies.has('refreshToken'),
          concurrentTotp[index].status === 'fulfilled',
          'Seule la connexion validee recoit un cookie',
        );
      }

      const storedTotp =
        await prisma.totpCredential.findUniqueOrThrow({
          where: { userId: id },
        });

      assert.ok(
        storedTotp.lastUsedStep !== null &&
        storedTotp.lastUsedStep > credential.lastUsedStep,
        'Le compteur TOTP doit progresser',
      );

      // 9. Une session ayant valide le second facteur
      // peut renouveler son jeton.
      const newRefreshToken =
        recoveredResponse.cookies.get('refreshToken');

      const rotatedResponse = response();

      const rotated = await rotateRefreshToken(
        newRefreshToken,
        rotatedResponse,
      );

      assert.ok(rotated.accessToken);
      assert.notEqual(
        rotatedResponse.cookies.get('refreshToken'),
        newRefreshToken,
      );

      // 10. L'ancien refresh token est a usage unique.
      await assert.rejects(
        rotateRefreshToken(
          newRefreshToken,
          response(),
        ),
      );

    } finally {
      // Suppression des donnees de test uniquement.
      // La base entiere sera egalement detruite.
      await prisma.refreshToken.deleteMany({
        where: { userId: id },
      });

      await prisma.authSession.deleteMany({
        where: { userId: id },
      });

      await prisma.totpRecoveryCode.deleteMany({
        where: { userId: id },
      });

      await prisma.totpCredential.deleteMany({
        where: { userId: id },
      });

      await prisma.auditLog.deleteMany({
        where: { userId: id },
      });

      await prisma.user.deleteMany({
        where: { id },
      });

      await prisma.tenant.deleteMany({
        where: { id: tenantId },
      });

      await prisma.$disconnect();
    }
  },
);
