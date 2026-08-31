import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth/jwt';
import { authProvider } from '@/lib/auth/provider';

/** Extract the bearer token from the Authorization header, if present. */
function extractBearerToken(req: Request): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

// GET /api/auth/me -> {user:{id, role, name}} for a valid bearer token
export async function GET(req: Request) {
  const token = extractBearerToken(req);
  if (!token) {
    return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  const user = await authProvider.verify(payload.id);
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 401 });
  }

  return NextResponse.json({ user });
}
