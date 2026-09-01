import { NextResponse } from 'next/server';

// POST /api/auth/logout
// JWT auth is stateless: there is no server session to destroy.
// The client simply discards the token. Route exists so the client has a
// stable endpoint and for future server-side revocation lists.
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set('luna-token', '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
