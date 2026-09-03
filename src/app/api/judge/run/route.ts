import pLimit from 'p-limit';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { MAX_OUTPUT_BYTES } from '@/lib/judge/harness';
import { getJudgeProvider } from '@/lib/providers/judge';

/**
 * Maximum accepted source/stdin size in characters (64 KB).
 * Module-private: Next.js route files may only export HTTP handlers + config.
 */
const MAX_CODE_SIZE = 64 * 1024;

/**
 * Security posture of POST /api/judge/run:
 * 1. IP rate limit - 10 requests / minute / IP (in-memory buckets below).
 * 2. Concurrency limit 3 via p-limit - excess requests QUEUE instead of piling
 *    up unbounded gcc processes on the host.
 * 3. Output cap 1 MB per stream (stdout/stderr/valgrind) before serializing.
 * 4. Network ban - user code never runs in-process. The docker runner already
 *    executes with --network=none (src/lib/providers/judge/docker.ts), so
 *    egress is blocked there; the local runner inherits the host network,
 *    which is accepted for the local-dev MVP only.
 */

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_IP = 10;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

/** At most 3 judge runs in flight per process; the 4th waits in the queue. */
const judgeRun = pLimit(3);

function clientIp(req: Request): string {
  // Trust the first XFF hop (reverse-proxy convention). Spoofable in the MVP,
  // but this limiter only guards against accidental floods, not adversaries.
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim() || 'unknown';
  return req.headers.get('x-real-ip') ?? 'unknown';
}

/** In-memory fixed-window token bucket per IP. Returns retry hint on refusal. */
function takeRateToken(ip: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  // Lazy sweep: keep the map bounded on long-running servers.
  if (rateBuckets.size > 1024) {
    rateBuckets.forEach((bucket, key) => {
      if (bucket.resetAt <= now) rateBuckets.delete(key);
    });
  }
  const bucket = rateBuckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (bucket.count >= RATE_MAX_PER_IP) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return { allowed: false, retryAfterSeconds };
  }
  bucket.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

function capOutput(text: string): string {
  if (Buffer.byteLength(text, 'utf8') <= MAX_OUTPUT_BYTES) return text;
  return text.slice(0, MAX_OUTPUT_BYTES) + '\n[output truncated at 1MB]';
}

const judgeRunSchema = z.object({
  language: z.literal('c', { error: 'language must be "c"' }),
  source: z
    .string({ error: 'source must be a string' })
    .min(1, 'source must not be empty')
    .max(MAX_CODE_SIZE, `source must be <= ${MAX_CODE_SIZE} bytes`),
  stdin: z.string({ error: 'stdin must be a string' }).max(MAX_CODE_SIZE).optional(),
  limits: z
    .object({
      cpuTime: z.number().positive('cpuTime must be > 0'),
      memory: z.number().positive('memory must be > 0'),
      timeoutMs: z.number().positive('timeoutMs must be > 0'),
    })
    .optional(),
});

/**
 * POST /api/judge/run
 *
 * Thin wrapper: validates the request against the JudgeProvider contract,
 * enforces rate/concurrency/output limits, and delegates to the provider
 * selected by JUDGE_MODE (real docker / local runners from todo 9).
 */
export async function POST(req: Request) {
  // Rate limit first: even malformed requests count, so a flood of bad JSON
  // cannot bypass the quota and hammer the expensive judge path.
  const rate = takeRateToken(clientIp(req));
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', message: 'Too many judge requests from this IP, slow down' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'INVALID_JSON', message: 'Request body must be valid JSON' },
      { status: 400 }
    );
  }

  const parsed = judgeRunSchema.safeParse(body);
  if (!parsed.success) {
    const raw = (body ?? {}) as { source?: unknown };
    const tooLarge = typeof raw.source === 'string' && raw.source.length > MAX_CODE_SIZE;
    if (tooLarge) {
      return NextResponse.json(
        {
          error: 'CODE_TOO_LARGE',
          message: `source exceeds maximum size of ${MAX_CODE_SIZE} bytes`,
        },
        { status: 413 }
      );
    }
    return NextResponse.json(
      {
        error: 'INVALID_INPUT',
        message: parsed.error.issues.map((issue) => issue.message).join('; '),
      },
      { status: 400 }
    );
  }

  try {
    const provider = getJudgeProvider();
    // p-limit queues the 4th+ concurrent request instead of spawning
    // unbounded compile/run processes. Network egress of user code is banned
    // by the docker runner's --network=none (see header comment).
    const result = await judgeRun(() => provider.run(parsed.data));
    const capped = {
      ...result,
      stdout: capOutput(result.stdout),
      stderr: capOutput(result.stderr),
      ...(result.valgrind !== undefined ? { valgrind: capOutput(result.valgrind) } : {}),
    };
    return NextResponse.json(capped);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[judge/run] provider failed:', detail);
    const infra = detail.includes('JUDGE_INFRA');
    return NextResponse.json(
      {
        error: infra ? 'JUDGE_UNAVAILABLE' : 'JUDGE_FAILED',
        message: infra
          ? detail.replace(/^JUDGE_INFRA:\s*/, '')
          : 'Judge provider failed to run the submission',
      },
      { status: infra ? 503 : 500 }
    );
  }
}
