import { NextResponse } from 'next/server';

// POST /api/auth/logout
// JWT auth is stateless: there is no server session to destroy.
// The client simply discards the token. Route exists so the client has a
// stable endpoint and for future server-side revocation lists.
export async function POST() {
  return NextResponse.json({ ok: true });
}
