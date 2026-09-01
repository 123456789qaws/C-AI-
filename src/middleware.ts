import { NextRequest, NextResponse } from 'next/server';

// MVP auth gate + home landing + page guards.
//
// - `/` -> redirect to /login if no valid token, else to /classes (class as home for both roles)
// - Protected pages: /classes/*, /tasks/*, /dashboard/*, /admin/*
// - Protected APIs: /api/checkpoint/*, /api/logs/*, /api/admin/*, /api/classes/*, /api/tasks/*, /api/scores/*, /api/assignments/*
// - Public: /login, /api/auth/*, /api/health, assets, _next
//
// Token sources (Edge-safe):
//   1) Cookie `luna-token` (set by /api/auth/login for page navigation)
//   2) Authorization: Bearer <token> (API clients)
// Verification uses Web Crypto HS256 (Edge runtime has no Node crypto/jsonwebtoken).

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

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
    if (v === -1) return new Uint8Array(0);
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

function extractToken(req: NextRequest): string | null {
  const cookieToken = req.cookies.get('luna-token')?.value;
  if (cookieToken) return cookieToken;
  const header = req.headers.get('authorization');
  if (header?.startsWith('Bearer ')) {
    const t = header.slice(7).trim();
    if (t) return t;
  }
  return null;
}

function isApiPath(pathname: string): boolean {
  return pathname.startsWith('/api/');
}

export async function middleware(req: NextRequest) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Auth not configured' }, { status: 500 });
  }

  const { pathname } = req.nextUrl;

  // Allow public paths without auth
  const publicPrefixes = ['/login', '/api/auth', '/api/health', '/_next', '/favicon', '/assets'];
  const isPublic = publicPrefixes.some((p) => pathname === p || pathname.startsWith(p + '/'));
  // Root is handled separately (landing redirect)
  if (isPublic) {
    return NextResponse.next();
  }

  const token = extractToken(req);
  const hasValidToken = token ? await verifyHs256Signature(token, secret) : false;

  // 1) `/` -> class landing for authenticated, login for anonymous
  if (pathname === '/') {
    if (hasValidToken) {
      const url = req.nextUrl.clone();
      url.pathname = '/classes';
      return NextResponse.redirect(url);
    }
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // 2) Protected page/API sets
  const protectedPagePrefixes = ['/classes', '/tasks', '/dashboard', '/admin'];
  const protectedApiPrefixes = [
    '/api/checkpoint',
    '/api/logs',
    '/api/admin',
    '/api/classes',
    '/api/tasks',
    '/api/scores',
    '/api/assignments',
  ];

  const isProtectedPage = protectedPagePrefixes.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );
  const isProtectedApi = protectedApiPrefixes.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );

  if (isProtectedPage || isProtectedApi) {
    if (!hasValidToken) {
      if (isApiPath(pathname)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
    // Auth passed: let route handle role checks (e.g. /dashboard needs TEACHER)
    return NextResponse.next();
  }

  // Everything else passes through
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/classes/:path*',
    '/tasks/:path*',
    '/dashboard/:path*',
    '/admin/:path*',
    '/api/checkpoint/:path*',
    '/api/logs/:path*',
    '/api/admin/:path*',
    '/api/classes/:path*',
    '/api/tasks/:path*',
    '/api/scores/:path*',
    '/api/assignments/:path*',
  ],
};
