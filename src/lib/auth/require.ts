import 'server-only';

import { NextRequest } from 'next/server';
import { verifyToken, type JwtPayload } from './jwt';
import { Role } from '@prisma/client';

/** Result of requireUser: either the authenticated user payload or null (unauthorized). */
export type AuthResult = JwtPayload | null;

/**
 * Extract and verify Bearer token from request.
 * Returns {id, role} on success, null on missing/invalid/expired token.
 */
export function requireUser(req: NextRequest): AuthResult {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  if (!token) return null;
  return verifyToken(token);
}

/**
 * Require specific role(s). Returns the payload if authorized, null otherwise.
 * Usage: const user = requireRole(req, [Role.TEACHER, Role.ADMIN]); if (!user) return 403;
 */
export function requireRole(req: NextRequest, roles: Role[]): AuthResult {
  const user = requireUser(req);
  if (!user) return null;
  if (!roles.includes(user.role as Role)) return null;
  return user;
}

/**
 * Convenience: require TEACHER, TA or ADMIN (teacher perspective).
 */
export function requireTeacher(req: NextRequest): AuthResult {
  return requireRole(req, [Role.TEACHER, Role.TA, Role.ADMIN]);
}

/**
 * Convenience: require ADMIN only.
 */
export function requireAdmin(req: NextRequest): AuthResult {
  return requireRole(req, [Role.ADMIN]);
}

/**
 * Convenience: require STUDENT only.
 */
export function requireStudent(req: NextRequest): AuthResult {
  return requireRole(req, [Role.STUDENT]);
}
