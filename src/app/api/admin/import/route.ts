import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { requireAdmin } from '@/lib/auth/require';

const importUserSchema = z.object({
  id: z.string().min(1, 'id is required').max(64),
  name: z.string().min(1, 'name is required').max(100),
  role: z.enum(['STUDENT', 'TEACHER', 'TA', 'ADMIN']),
  password: z.string().min(6, 'password must be at least 6 characters').max(128),
});

const importSchema = z.object({
  users: z.array(importUserSchema).min(1, 'at least one user required').max(1000),
});

/** POST /api/admin/import — ADMIN 批量导入账号 {users: [{id, name, role, password}]} */
export async function POST(req: NextRequest) {
  const user = requireAdmin(req);
  if (!user) {
    return NextResponse.json({ error: 'Forbidden: ADMIN required' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', message: parsed.error.issues.map((i) => i.message).join('; ') },
      { status: 400 }
    );
  }

  const { users } = parsed.data;

  let successCount = 0;
  let failCount = 0;
  const errors: Array<{ id: string; error: string }> = [];

  for (const u of users) {
    try {
      const passwordHash = await hashPassword(u.password);
      await prisma.user.upsert({
        where: { id: u.id },
        update: { role: u.role, name: u.name, passwordHash },
        create: { id: u.id, role: u.role, name: u.name, passwordHash },
      });
      successCount++;
    } catch (err) {
      failCount++;
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ id: u.id, error: msg });
      console.error(`[admin/import] failed for user ${u.id}:`, msg);
    }
  }

  return NextResponse.json({
    success: successCount,
    failed: failCount,
    errors: errors.length > 0 ? errors : undefined,
  });
}
