import { GraphQLError } from 'graphql';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { logAudit } from '../middleware/audit';
import { passwordSchema } from '../utils/validation';

// ─── Types ────────────────────────────────────────────────────────────────────

export const USER_INCLUDE = {
  roleAssignments: {
    include: {
      role: {
        include: {
          permissions: { include: { permission: true } },
        },
      },
    },
  },
} satisfies Prisma.UserInclude;

export type UserWithRoles = Prisma.UserGetPayload<{ include: typeof USER_INCLUDE }>;

// ─── Constants ────────────────────────────────────────────────────────────────

const REFRESH_TTL_DAYS = 7;
const ACCESS_TTL = '15m';

// ─── Rate limiter login (en mémoire, par IP) ──────────────────────────────────
// Max 10 tentatives par fenêtre de 15 min. Adapté à un déploiement single-instance.

const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function checkLoginRateLimit(ip: string): void {
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return;
  }

  if (entry.count >= LOGIN_MAX_ATTEMPTS) {
    throw new GraphQLError('Trop de tentatives de connexion. Réessayez dans 15 minutes.', {
      extensions: { code: 'TOO_MANY_REQUESTS' },
    });
  }

  entry.count += 1;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function generateAccessToken(
  userId: string,
  email: string,
  sessionVersion: number,
): string {
  return jwt.sign({ userId, email, sessionVersion }, process.env.JWT_SECRET!, { expiresIn: ACCESS_TTL, algorithm: 'HS256' });
}

async function findActiveUser(filter: { id?: string; email?: string }): Promise<UserWithRoles | null> {
  const user = await prisma.user.findFirst({ where: { ...filter, deletedAt: null, isActive: true }, include: USER_INCLUDE });
  return user;
}

function setRefreshCookie(res: Response, token: string): void {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

async function issueRefreshToken(userId: string, res: Response): Promise<void> {
  const token = jwt.sign({ userId, jti: randomUUID() }, process.env.JWT_REFRESH_SECRET!, {
    expiresIn: `${REFRESH_TTL_DAYS}d`,
    algorithm: 'HS256',
  });
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 86_400_000);
  await prisma.refreshToken.create({ data: { token, userId, expiresAt } });
  setRefreshCookie(res, token);
}

async function issueRefreshTokenForVerifiedLogin(userId: string, verifiedPasswordHash: string, res: Response): Promise<number> {
  const token = jwt.sign({ userId, jti: randomUUID() }, process.env.JWT_REFRESH_SECRET!, {
    expiresIn: `${REFRESH_TTL_DAYS}d`,
    algorithm: 'HS256',
  });
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 86_400_000);
  const sessionVersion = await prisma.$transaction(async tx => {
    // Le verrou reste actif jusqu'au COMMIT du jeton.
    // Une reinitialisation du compte doit attendre cette
    // transaction, ou etre observee avant l'emission.
    const locked = await tx.$queryRaw<
      Array<{ passwordHash: string; sessionVersion: number }>
    >`
      SELECT "passwordHash", "sessionVersion"
      FROM "User"
      WHERE "id" = ${userId}
        AND "deletedAt" IS NULL
        AND "isActive" = TRUE
      FOR UPDATE
    `;

    if (
      locked.length !== 1 ||
      locked[0].passwordHash !== verifiedPasswordHash
    ) {
      throw new GraphQLError(
        'Session invalidee : veuillez vous reconnecter',
        { extensions: { code: 'UNAUTHENTICATED' } },
      );
    }

    await tx.refreshToken.create({
      data: { token, userId, expiresAt },
    });

    return locked[0].sessionVersion;
  });

  if (
    !Number.isSafeInteger(sessionVersion) ||
    sessionVersion < 0
  ) {
    throw new GraphQLError(
      'Version de session invalide',
      { extensions: { code: 'UNAUTHENTICATED' } },
    );
  }

  setRefreshCookie(res, token);
  return sessionVersion;
}

// ─── Auth operations ──────────────────────────────────────────────────────────

export async function login(
  email: string,
  password: string,
  res: Response,
  ipAddress?: string | null,
): Promise<{ accessToken: string; user: UserWithRoles }> {
  // C1 — vérifier le rate limit avant tout traitement
  checkLoginRateLimit(ipAddress ?? 'unknown');

  // Email insensible à la casse : normalisé à la connexion comme à la création
  // (adminCreateUserSchema applique aussi .toLowerCase()).
  const normalizedEmail = email.trim().toLowerCase();
  const user = await findActiveUser({ email: normalizedEmail });

  // C4 — anti-timing : toujours exécuter bcrypt même si l'utilisateur est introuvable
  const DUMMY_HASH = '$2a$12$invalidhashpaddingtoconstanttime000000000000000000000000';
  const passwordValid = user
    ? await bcrypt.compare(password, user.passwordHash)
    : (await bcrypt.compare(password, DUMMY_HASH), false);

  if (!user || !passwordValid) {
    logAudit({ action: 'LOGIN_FAILED', resource: 'AUTH', metadata: { email }, ipAddress });
    throw new GraphQLError('Email ou mot de passe incorrect', {
      extensions: { code: 'UNAUTHENTICATED' },
    });
  }

  const sessionVersion = await issueRefreshTokenForVerifiedLogin(user.id, user.passwordHash, res);
  const accessToken = generateAccessToken(user.id, user.email, sessionVersion);

  logAudit({ userId: user.id, action: 'LOGIN', resource: 'AUTH', ipAddress });

  return { accessToken, user };
}

export async function logout(
  userId: string,
  refreshToken: string,
  res: Response,
): Promise<boolean> {
  await prisma.refreshToken.deleteMany({ where: { userId, token: refreshToken } });
  res.clearCookie('refreshToken', { httpOnly: true, sameSite: 'strict', path: '/' });
  logAudit({ userId, action: 'LOGOUT', resource: 'AUTH' });
  return true;
}

export async function rotateRefreshToken(
  currentToken: string,
  res: Response,
): Promise<{ accessToken: string; user: UserWithRoles }> {
  let payload: { userId: string };
  try {
    payload = jwt.verify(currentToken, process.env.JWT_REFRESH_SECRET!, { algorithms: ['HS256'] }) as { userId: string };
  } catch {
    throw new GraphQLError('Session expirée', { extensions: { code: 'UNAUTHENTICATED' } });
  }

  // La ligne utilisateur est verrouillee avant la
  // verification du jeton. Reset et rotation ne peuvent
  // plus passer l'un apres l'autre sans observer l'etat
  // reel de la base PostgreSQL.
  const rotated = await prisma.$transaction(async tx => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "User"
      WHERE "id" = ${payload.userId}
        AND "deletedAt" IS NULL
        AND "isActive" = TRUE
      FOR UPDATE
    `;

    if (locked.length !== 1) {
      throw new GraphQLError(
        'Session expiree',
        { extensions: { code: 'UNAUTHENTICATED' } },
      );
    }

    // La verification du jeton suit le verrou :
    // une revocation administrative deja validee
    // doit etre visible ici.
    const stored = await tx.refreshToken.findUnique({
      where: { token: currentToken },
    });

    if (
      !stored ||
      stored.userId !== payload.userId ||
      stored.expiresAt <= new Date()
    ) {
      throw new GraphQLError(
        'Session expiree',
        { extensions: { code: 'UNAUTHENTICATED' } },
      );
    }

    const user = await tx.user.findFirst({
      where: {
        id: payload.userId,
        deletedAt: null,
        isActive: true,
      },
      include: USER_INCLUDE,
    });

    if (!user) {
      throw new GraphQLError(
        'Utilisateur introuvable',
        { extensions: { code: 'UNAUTHENTICATED' } },
      );
    }

    // La consommation de l'ancien jeton et la creation
    // du suivant sont atomiques.
    await tx.refreshToken.delete({
      where: { token: currentToken },
    });

    const nextToken = jwt.sign(
      { userId: user.id, jti: randomUUID() },
      process.env.JWT_REFRESH_SECRET!,
      {
        expiresIn: `${REFRESH_TTL_DAYS}d`,
        algorithm: 'HS256',
      },
    );

    const expiresAt = new Date(
      Date.now() + REFRESH_TTL_DAYS * 86_400_000,
    );

    await tx.refreshToken.create({
      data: {
        token: nextToken,
        userId: user.id,
        expiresAt,
      },
    });

    return { user, nextToken };
  });

  // Cookie emis seulement apres le COMMIT.
  setRefreshCookie(res, rotated.nextToken);

  return {
    accessToken: generateAccessToken(
      rotated.user.id,
      rotated.user.email,
      rotated.user.sessionVersion,
    ),
    user: rotated.user,
  };
}

export async function getMe(userId: string): Promise<UserWithRoles | null> {
  return findActiveUser({ id: userId });
}

/**
 * Changement de mot de passe (C3 — DÉC-3).
 * Valide la complexité, met à jour le hash et réinitialise mustChangePassword.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  ipAddress?: string | null,
  res?: Response | null,
): Promise<boolean> {
  const result = passwordSchema.safeParse(newPassword);
  if (!result.success) {
    throw new GraphQLError(result.error.issues[0].message, {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }

  const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null, isActive: true } });
  if (!user) {
    throw new GraphQLError('Utilisateur introuvable', { extensions: { code: 'UNAUTHENTICATED' } });
  }

  const currentValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!currentValid) {
    throw new GraphQLError('Mot de passe actuel incorrect', { extensions: { code: 'FORBIDDEN' } });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  // Compare-And-Swap : le hash valide doit encore etre celui
  // qui a ete verifie avec bcrypt.compare plus haut.
  // Une reinitialisation concurrente rend donc ce changement
  // impossible, meme si elle intervient pendant le bcrypt.
  await prisma.$transaction(async tx => {
    const updated = await tx.user.updateMany({
      where: {
        id: userId,
        passwordHash: user.passwordHash,
        deletedAt: null,
        isActive: true,
      },
      data: {
        passwordHash,
        mustChangePassword: false,
        sessionVersion: { increment: 1 },
      },
    });

    if (updated.count !== 1) {
      throw new GraphQLError(
        'Mot de passe modifie entre-temps : recommencez',
        { extensions: { code: 'FORBIDDEN' } },
      );
    }

    // La mise a jour et la revocation des anciennes sessions
    // appartiennent a la meme transaction PostgreSQL.
    await tx.refreshToken.deleteMany({
      where: { userId },
    });
  });

  // Continuité de la session courante apres validation.
  // La concurrence d'emission des nouveaux tokens sera
  // auditee separement.

  // Une reinitialisation administrative peut intervenir
  // apres le COMMIT du changement de mot de passe.
  // Le helper verrouille alors le compte et refuse
  // toute emission si le hash vient de changer.
  if (res) {
    await issueRefreshTokenForVerifiedLogin(
      userId,
      passwordHash,
      res,
    );
  }

  logAudit({ userId, action: 'CHANGE_PASSWORD', resource: 'AUTH', ipAddress });
  return true;
}
