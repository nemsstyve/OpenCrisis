import jwt from 'jsonwebtoken';

export interface JwtAccessPayload {
  userId: string;
  email: string;
}

export function verifyAccessToken(token: string): JwtAccessPayload | null {
  try {
    return jwt.verify(token, process.env.JWT_SECRET!) as JwtAccessPayload;
  } catch {
    return null;
  }
}

export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}
