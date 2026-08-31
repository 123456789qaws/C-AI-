import { NextResponse } from 'next/server';
import { z } from 'zod';
import { signToken } from '@/lib/auth/jwt';
import { authProvider } from '@/lib/auth/provider';

const loginSchema = z.object({
  id: z.string().min(1, 'id is required'),
  password: z.string().min(1, 'password is required'),
});

// POST /api/auth/login {id, password} -> {token, user:{id, role, name}}
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'id and password are required' }, { status: 400 });
  }

  const user = await authProvider.login(parsed.data.id, parsed.data.password);
  if (!user) {
    // Same message for unknown id and wrong password (avoid id enumeration).
    return NextResponse.json({ error: 'Invalid id or password' }, { status: 401 });
  }

  const token = signToken({ id: user.id, role: user.role });
  return NextResponse.json({ token, user });
}
