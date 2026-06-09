import { GraphQLError } from 'graphql';
import jwt from 'jsonwebtoken';
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

export function generateAccessToken(userId: string, email: string): string {
  return jwt.sign({ userId, email }, process.env.JWT_SECRET!, { expiresIn: ACCESS_TTL, algorithm: 'HS256' });
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
  const token = jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET!, {
    expiresIn: `${REFRESH_TTL_DAYS}d`,
    algorithm: 'HS256',
  });
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 86_400_000);
  await prisma.refreshToken.create({ data: { token, userId, expiresAt } });
  setRefreshCookie(res, token);
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

  const user = await findActiveUser({ email });

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

  await issueRefreshToken(user.id, res);
  const accessToken = generateAccessToken(user.id, user.email);

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

  const stored = await prisma.refreshToken.findUnique({ where: { token: currentToken } });
  if (!stored || stored.expiresAt < new Date()) {
    throw new GraphQLError('Session expirée', { extensions: { code: 'UNAUTHENTICATED' } });
  }

  await prisma.refreshToken.delete({ where: { token: currentToken } });

  const user = await findActiveUser({ id: payload.userId });
  if (!user) {
    throw new GraphQLError('Utilisateur introuvable', { extensions: { code: 'UNAUTHENTICATED' } });
  }

  await issueRefreshToken(user.id, res);
  return { accessToken: generateAccessToken(user.id, user.email), user };
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
    throw new GraphQLError(result.error.errors[0].message, {
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
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, mustChangePassword: false },
  });

  // N1 — révoquer toutes les sessions existantes après changement de mot de passe,
  // puis ré-émettre un token pour la session courante (continuité côté front).
  await prisma.refreshToken.deleteMany({ where: { userId } });
  if (res) await issueRefreshToken(userId, res);

  logAudit({ userId, action: 'CHANGE_PASSWORD', resource: 'AUTH', ipAddress });
  return true;
}
