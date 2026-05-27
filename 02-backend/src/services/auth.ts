import { GraphQLError } from 'graphql';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import type { Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { logAudit } from '../middleware/audit';

// ─── Types ────────────────────────────────────────────────────────────────────

const USER_INCLUDE = {
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function generateAccessToken(userId: string, email: string): string {
  return jwt.sign({ userId, email }, process.env.JWT_SECRET!, { expiresIn: ACCESS_TTL });
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
  const user = await findActiveUser({ email });

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new GraphQLError('Email ou mot de passe incorrect', {
      extensions: { code: 'UNAUTHENTICATED' },
    });
  }

  await issueRefreshToken(user.id, res);
  const accessToken = generateAccessToken(user.id, user.email);

  await logAudit({ userId: user.id, action: 'LOGIN', resource: 'AUTH', ipAddress });

  return { accessToken, user };
}

export async function logout(
  userId: string,
  refreshToken: string,
  res: Response,
): Promise<boolean> {
  await prisma.refreshToken.deleteMany({ where: { userId, token: refreshToken } });
  res.clearCookie('refreshToken', { httpOnly: true, sameSite: 'strict', path: '/' });
  await logAudit({ userId, action: 'LOGOUT', resource: 'AUTH' });
  return true;
}

export async function rotateRefreshToken(
  currentToken: string,
  res: Response,
): Promise<{ accessToken: string; user: UserWithRoles }> {
  let payload: { userId: string };
  try {
    payload = jwt.verify(currentToken, process.env.JWT_REFRESH_SECRET!) as { userId: string };
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
