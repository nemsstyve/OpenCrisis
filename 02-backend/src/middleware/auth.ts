import jwt from 'jsonwebtoken';
import { prisma } from '../prisma';

export interface JwtAccessPayload {
  userId: string;
  email: string;
  sessionVersion: number;
}

export function verifyAccessToken(token: string): JwtAccessPayload | null {
  try {
    // C5 — épingler l'algorithme pour éviter l'attaque "alg: none"
    return jwt.verify(token, process.env.JWT_SECRET!, { algorithms: ['HS256'] }) as JwtAccessPayload;
  } catch {
    return null;
  }
}

export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}


/**
 * Verifie la signature JWT puis l'etat actuel du compte.
 * Les JWT sans sessionVersion sont refuses.
 * Toute erreur PostgreSQL provoque un refus (fail closed).
 */
export async function verifyActiveAccessToken(
  token: string,
): Promise<JwtAccessPayload | null> {
  const payload = verifyAccessToken(token);

  if (
    !payload ||
    typeof payload.userId !== 'string' ||
    payload.userId.length === 0 ||
    typeof payload.email !== 'string' ||
    payload.email.length === 0 ||
    !Number.isSafeInteger(payload.sessionVersion) ||
    payload.sessionVersion < 0
  ) {
    return null;
  }

  try {
    const user = await prisma.user.findFirst({
      where: {
        id: payload.userId,
        email: payload.email,
        isActive: true,
        deletedAt: null,
      },
      select: {
        sessionVersion: true,
      },
    });

    if (
      !user ||
      user.sessionVersion !== payload.sessionVersion
    ) {
      return null;
    }

    return payload;
  } catch {
    // Une panne DB ne doit jamais autoriser un jeton
    // dont l'etat de revocation est inconnu.
    return null;
  }
}
