import bcrypt from 'bcryptjs';
import { GraphQLError } from 'graphql';
import { prisma } from '../prisma';
import { consumeMfaAttempt } from './mfaRateLimit';
import {
  decryptTotpSecret,
  encryptTotpSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  verifyTotpStep,
} from './totp';

function denied(): never {
  throw new GraphQLError(
    'Verification de securite refusee',
    { extensions: { code: 'FORBIDDEN' } },
  );
}

async function verifyPassword(
  userId: string,
  password: string,
): Promise<string> {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      deletedAt: null,
      isActive: true,
    },
    select: { passwordHash: true },
  });

  if (
    !user ||
    !(await bcrypt.compare(password, user.passwordHash))
  ) {
    denied();
  }

  return user.passwordHash;
}

async function lockUser(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  userId: string,
  expectedPasswordHash: string,
): Promise<void> {
  const rows = await tx.$queryRaw<
    Array<{ passwordHash: string }>
  >`
    SELECT "passwordHash"
    FROM "User"
    WHERE "id" = ${userId}
      AND "deletedAt" IS NULL
      AND "isActive" = TRUE
    FOR UPDATE
  `;

  if (
    rows.length !== 1 ||
    rows[0].passwordHash !== expectedPasswordHash
  ) {
    denied();
  }
}

export async function beginTotpEnrollment(
  userId: string,
  password: string,
): Promise<{ secret: string; provisioningUri: string }> {
  const expectedHash = await verifyPassword(
    userId,
    password,
  );

  const secret = generateTotpSecret();
  const encrypted = encryptTotpSecret(secret, userId);

  const result = await prisma.$transaction(async tx => {
    await lockUser(tx, userId, expectedHash);

    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true },
    });

    const current = await tx.totpCredential.findUnique({
      where: { userId },
    });

    if (current?.enabledAt) denied();

    await tx.totpCredential.upsert({
      where: { userId },
      create: {
        userId,
        pendingSecretCiphertext: encrypted,
        pendingExpiresAt: new Date(Date.now() + 600000),
      },
      update: {
        pendingSecretCiphertext: encrypted,
        pendingExpiresAt: new Date(Date.now() + 600000),
      },
    });

    return user.email;
  });

  const label = encodeURIComponent(`OpenCrisis:${result}`);

  const provisioningUri =
    `otpauth://totp/${label}` +
    `?secret=${secret}` +
    `&issuer=${encodeURIComponent('OpenCrisis')}` +
    '&algorithm=SHA1&digits=6&period=30';

  return { secret, provisioningUri };
}

export async function enableTotp(
  userId: string,
  code: string,
): Promise<string[]> {
  await consumeMfaAttempt(userId);
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "User"
      WHERE "id" = ${userId}
        AND "deletedAt" IS NULL
        AND "isActive" = TRUE
      FOR UPDATE
    `;

    if (rows.length !== 1) denied();

    const current = await tx.totpCredential.findUnique({
      where: { userId },
    });

    if (
      !current ||
      current.enabledAt ||
      !current.pendingSecretCiphertext ||
      !current.pendingExpiresAt ||
      current.pendingExpiresAt <= new Date()
    ) {
      denied();
    }

    const secret = decryptTotpSecret(
      current.pendingSecretCiphertext,
      userId,
    );

    const step = verifyTotpStep(secret, code);
    if (step === null) denied();

    const codes = generateRecoveryCodes();

    await tx.totpCredential.update({
      where: { userId },
      data: {
        secretCiphertext: current.pendingSecretCiphertext,
        pendingSecretCiphertext: null,
        pendingExpiresAt: null,
        enabledAt: new Date(),
        lastUsedStep: step,
      },
    });

    await tx.totpRecoveryCode.deleteMany({
      where: { userId },
    });

    await tx.totpRecoveryCode.createMany({
      data: codes.map(value => ({
        userId,
        codeHash: hashRecoveryCode(value),
      })),
    });

    // L'activation invalide les sessions existantes.
    await tx.user.update({
      where: { id: userId },
      data: { sessionVersion: { increment: 1 } },
    });

    await tx.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await tx.refreshToken.deleteMany({
      where: { userId },
    });

    return codes;
  });
}

export async function disableTotp(
  userId: string,
  password: string,
  code: string,
): Promise<boolean> {
  const expectedHash = await verifyPassword(
    userId,
    password,
  );

  await consumeMfaAttempt(userId);
  return prisma.$transaction(async tx => {
    await lockUser(tx, userId, expectedHash);

    const current = await tx.totpCredential.findUnique({
      where: { userId },
    });

    if (
      !current?.enabledAt ||
      !current.secretCiphertext
    ) {
      denied();
    }

    const secret = decryptTotpSecret(
      current.secretCiphertext,
      userId,
    );

    const step = verifyTotpStep(
      secret,
      code,
      Date.now(),
      current.lastUsedStep,
    );

    if (step === null) denied();

    await tx.totpCredential.delete({
      where: { userId },
    });

    await tx.user.update({
      where: { id: userId },
      data: { sessionVersion: { increment: 1 } },
    });

    await tx.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await tx.refreshToken.deleteMany({
      where: { userId },
    });

    return true;
  });
}
