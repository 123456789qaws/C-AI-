# Task 15 Evidence: AI 限流/熔断/日志脱敏与 5 次上限

- Checkbox: `- [ ] 15. AI 限流/熔断/日志脱敏与 5 次上限`
- Date: 2026-08-31

## Files

| File | Status |
|------|--------|
| `src/lib/ai/rateLimit.ts` | Created — in-memory per-(studentId, checkpointId) bucket, `AI_RATE_LIMIT=5`, 1h window, `checkRateLimit()` |
| `src/lib/ai/guard.ts` | Created — `sanitizePrompt` (injection filter), `redactSecrets` (key masking), `logAiUsage` (token accounting) |
| `src/app/api/ai/socratic/route.ts` | Updated — rate limit 429, circuit breaker, sanitize, redact, token accounting |

## Design

- **Rate limit**: `Map<'${studentId}:${checkpointId}', {count, resetAt}>`, window 60min. Calls 1–5 allowed (remaining 4→0), 6th+ → 429. Lazy sweep of expired buckets when map > 1024 entries. Comment documents Redis/DB persistence for multi-instance (not enabled in MVP). Exports `AI_RATE_LIMIT = 5`.
- **Circuit breaker**: module-level `consecutiveProviderFailures`; on provider error increments; at `CIRCUIT_OPEN_THRESHOLD = 3` the current request falls back to `mockAIProvider` (HTTP 200, `provider: 'mock'`); while open, requests skip the real provider; a successful mock response resets the counter (half-open).
- **Injection filter**: `sanitizePrompt` strips control chars and removes patterns `['ignore previous','ignore all previous','ignore the above','system prompt','忽略之前','忽略以上','忽略上述','system:','assistant:']` (case-insensitive) applied to studentAnswer + history. `codeSnippet` keeps escape-only handling (control chars + truncation) so legitimate source code isn't corrupted.
- **Log redaction**: `redactSecrets` masks `sk-...` keys and `key|token|secret|password|authorization|bearer =` assignments; applied to all provider error logs. Responses never echo provider errors (generic 502).
- **Token accounting**: `logAiUsage` accumulates in-process totals and logs `{provider, tokens, totalTokens, checkpointId}` — no studentId/prompt content in logs.
- **Identity (MVP)**: `studentId` read from request body (max 128 chars), fallback `'anonymous'`; comment marks Task 17 (JWT) as the replacement.

## Functional Verification (dev server + HTTP calls)

Rate limit (AI_PROVIDER=mock, port 3157/3158):

```
CALL 1 -> 200 provider=mock remaining=4
CALL 2 -> 200 provider=mock remaining=3
CALL 3 -> 200 provider=mock remaining=2
CALL 4 -> 200 provider=mock remaining=1
CALL 5 -> 200 provider=mock remaining=0
CALL 6 -> 429
6TH_BODY={"error":"rate_limited","retryAfterSeconds":3600,"hint":"请联系教师放行"}
```

Circuit breaker (AI_PROVIDER=deepseek-api, DEEPSEEK_API_KEY unset → provider always throws, port 3159):

```
CALL 1 -> 502        # failure #1, under threshold
CALL 2 -> 502        # failure #2, under threshold
CALL 3 -> 200 provider=mock pass=True   # failure #3 trips breaker -> mock fallback
CALL 4 -> 200 provider=mock pass=True   # circuit open -> serves mock directly
CALL 5 -> 502        # mock success reset counter -> tries real provider again (half-open)
```

## Static Verification

```
pnpm exec prettier --write (own files)      -> clean
pnpm exec eslint (own 3 files)              -> exit 0
pnpm exec tsc --noEmit                      -> exit 0
pnpm lint                                   -> exit 0, "No ESLint warnings or errors"
pnpm build                                  -> exit 0, /api/ai/socratic registered (ƒ)
```

Note: repo-level `pnpm lint` initially failed on `src/lib/providers/judge/docker.ts` (parallel task 9's in-flight file, prettier-only errors). Formatting-only fix applied, NOT committed.

## Build Log (excerpt)

```
▲ Next.js 14.2.35
- Environments: .env

 Creating an optimized production build ...
 ✓ Compiled successfully
   Linting and checking validity of types ...
   Collecting page data ...
   Generating static pages (12/12) ...
 ✓ Generating static pages (12/12)
   Finalizing page optimization ...
   Collecting build traces ...

Route (app)                              Size     First Load JS
┌ ○ /                                    7.82 kB         107 kB
├ ○ /_not-found                          872 B          88.2 kB
├ ƒ /api/ai/socratic                     0 B                0 B
├ ƒ /api/auth/login                      0 B                0 B
├ ƒ /api/auth/logout                     0 B                0 B
├ ƒ /api/auth/me                         0 B                0 B
├ ○ /api/health                          0 B                0 B
├ ƒ /api/judge/run                       0 B                0 B
└ ○ /dashboard                           4.53 kB         104 kB
```

## Constraint Compliance

- No keys/tokens in responses or logs (redactSecrets + generic 502) ✅
- No valgrind followup (todo 16 untouched) ✅
- Build unbroken (pnpm build exit 0) ✅
