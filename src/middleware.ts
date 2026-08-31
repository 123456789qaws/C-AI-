import { NextRequest, NextResponse } from 'next/server';

// MVP auth gate for protected API routes.
//
// Middleware runs on the Edge runtime, where Node's `crypto` (and therefore
// `jsonwebtoken`) is unavailable — so we verify the HS256 signature directly
// with Web Crypto. The route handlers themselves re-verify via
// `verifyToken()` (Node runtime) as the authoritative check.
//
// Protected:  /api/checkpoint/*, /api/logs/*
// Allowed by default (no matcher): /api/health, /api/auth/*, pages, assets.

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Decode a base64url string into bytes (Edge-safe, no Buffer/atob). */
function base64UrlToBytes(input: string): Uint8Array<ArrayBuffer> {
  let b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4;
  if (pad === 2) b64 += '==';
  else if (pad === 3) b64 += '=';

  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < b64.length; i++) {
    const ch = b64[i];
    if (ch === '=') break;
    const v = B64_ALPHABET.indexOf(ch);
    if (v === -1) return new Uint8Array(0); // invalid char -> fail verification
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes[i];
  return out;
}

/** Verify a JWT's HS256 signature (RFC 7515) using Web Crypto. */
async function verifyHs256Signature(token: string, secret: string): Promise<boolean> {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const signingInput = `${parts[0]}.${parts[1]}`;

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    return crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlToBytes(parts[2]),
      new TextEncoder().encode(signingInput)
    );
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // Fail closed: without a secret nothing can be verified.
    return NextResponse.json({ error: 'Auth not configured' }, { status: 500 });
  }

  const header = req.headers.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token || !(await verifyHs256Signature(token, secret))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.next();
}

// Only run on protected API paths; /api/health, /api/auth/* and everything
// else pass through untouched.
export const config = {
  matcher: ['/api/checkpoint/:path*', '/api/logs/:path*'],
};
