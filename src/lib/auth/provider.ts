import 'server-only';

import type { Role } from '@prisma/client';
import prisma from '@/lib/db';
import { verifyPassword } from './password';

export type AuthUser = {
  id: string;
  role: Role;
  name: string;
};

/**
 * AuthProvider abstraction: MVP uses the local user table + bcrypt + JWT.
 * A school IAM (统一身份认证) provider can be swapped in later by implementing
 * the same interface without touching routes.
 */
export interface AuthProvider {
  /** Verify id+password and return the user, or null on failure. */
  login(id: string, password: string): Promise<AuthUser | null>;
  /** Resolve a user by id (post-JWT-verification identity lookup). */
  verify(id: string): Promise<AuthUser | null>;
}

export class LocalAuthProvider implements AuthProvider {
  async login(id: string, password: string): Promise<AuthUser | null> {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user?.passwordHash) return null;
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return null;
    return { id: user.id, role: user.role, name: user.name };
  }

  async verify(id: string): Promise<AuthUser | null> {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return null;
    return { id: user.id, role: user.role, name: user.name };
  }
}

export const authProvider: AuthProvider = new LocalAuthProvider();
