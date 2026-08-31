import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getJudgeProvider } from '@/lib/providers/judge';

/**
 * Maximum accepted source/stdin size in characters (64 KB).
 * Module-private: Next.js route files may only export HTTP handlers + config.
 */
const MAX_CODE_SIZE = 64 * 1024;

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
 * Thin wrapper: validates the request against the JudgeProvider contract and
 * delegates to the provider selected by JUDGE_MODE. Actual execution (docker /
 * local runners) lands in todo 9.
 *
 * TODO(rate-limit): add per-user/IP rate limiting before public exposure.
 */
export async function POST(req: Request) {
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

  const provider = getJudgeProvider();
  try {
    const result = await provider.run(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    console.error(`[judge/run] provider '${provider.name}' failed:`, err);
    return NextResponse.json(
      { error: 'JUDGE_FAILED', message: 'Judge provider failed to run the submission' },
      { status: 500 }
    );
  }
}
