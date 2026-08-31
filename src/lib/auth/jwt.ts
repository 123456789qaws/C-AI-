import jwt from 'jsonwebtoken';
import { env } from '@/lib/env';

export type JwtPayload = {
  id: string;
  role: string;
};

const EXPIRES_IN = '12h' as const;

/** Sign a JWT (HS256) carrying the authenticated user's id and role. */
export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: EXPIRES_IN });
}

/** Verify a JWT; returns the payload or null when invalid/expired. */
export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (typeof decoded === 'string') return null;
    return { id: decoded.id as string, role: decoded.role as string };
  } catch {
    return null;
  }
}
