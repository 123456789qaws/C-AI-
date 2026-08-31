# Task 10 - 判题限流与安全加固 + 隐藏测试执行器

## Checklist

- [x] `pnpm add p-limit` (v7.3.1)
- [x] `src/lib/judge/harness.ts` - batch hidden-test executor, WA returns nature hint, never the answer
- [x] `src/app/api/judge/run/route.ts` - IP rate limit 10/min + p-limit concurrency 3 + 1MB output cap + network-ban comment
- [x] `pnpm build` ✅ / `pnpm lint` ✅ (0 warnings, 0 errors)
- [x] Harness smoke (mock + real gcc), route smoke (HTTP) - all assertions pass
- [x] learnings.md Task10 appended

## What was built

### harness.ts - `runHiddenTests(code, tests, options?)`

```ts
interface HiddenTestCase { stdin?: string; expected: string; description?: string }
interface HiddenTestReport {
  allPassed: boolean;
  results: { testId, status: 'passed'|'failed'|'skipped', passed, actual, verdict, expectedHidden }[];
  firstFailure?: { testId, description?, hint };
}
```

- Runs each case through the JudgeProvider (user code out of process).
- Compare = trimmed stdout vs trimmed expected (CRLF normalized).
- Stops at FIRST failing case; `hint` is a NATURE description of the mistake
  kind (边界条件 / 数组越界 / 死循环 / 编译器诊断), never the raw expected value.
- `expectedHidden: true` is explicit in every result; the report has no field
  that could carry the answer. Smoke asserts the expected string appears
  nowhere in the serialized report.
- CE short-circuits (deterministic per source) = the practical "compile once".
- Exports `MAX_OUTPUT_BYTES` (1 MB) shared with the route.

### route.ts hardening

1. **IP rate limit**: in-memory fixed-window Map<ip,{count,resetAt}>, 10/min,
   lazy sweep when >1024 buckets. Exceed → `429 {"error":"RATE_LIMITED"}` +
   `Retry-After` header. Checked BEFORE JSON parse so malformed floods count.
2. **Concurrency**: `pLimit(3)` - the 4th concurrent request queues.
3. **Output cap**: stdout/stderr/valgrind each truncated at 1 MB with
   `[output truncated at 1MB]` marker.
4. **Network ban**: comment confirming docker runner's `--network=none`
   (src/lib/providers/judge/docker.ts); local runner shares host network,
   accepted for local-dev MVP.

## Verification

### Build

```
$ pnpm build
 ✓ Compiled successfully
 ƒ /api/judge/run   0 B   0 B
```

### Lint

```
$ pnpm lint
✔ No ESLint warnings or errors
```

### Harness smoke - `node --conditions react-server --import tsx scripts/smoke-judge-harness.ts`

```
ok - T1 allPassed
ok - T1 two passed results
ok - T1 no firstFailure
ok - T2 allPassed=false
ok - T2 stops at first WA (2 results, 3rd never ran)
ok - T2 student output exposed as actual
ok - T2 expectedHidden=true
ok - T2 firstFailure is case-2
ok - T2 description preserved
ok - T2 hint carries nature label
ok - T2 hint describes the mistake kind
ok - T2 hint does NOT leak the expected value
ok - T2 whole report leaks nothing
ok - T3 allPassed=false
ok - T3 single CE result, case 2 skipped
ok - T3 CE nature hint
ok - T4 RE hint mentions signal
ok - T4 RE hint mentions likely cause
ok - T4 TLE hint mentions infinite loop
ok - T5 actual capped near 1MB
ok - T5 truncation marker present
ok - T6 real gcc batch fails at case-4
ok - T6 real gcc ran 4 cases
ok - T6 firstFailure is case-4
ok - T6 real hint carries nature label
ok - T6 real hint leaks no expected value
ok - T6 student output exposed (actual=odd)
SMOKE OK
```

T6 used the REAL MinGW gcc runner (LocalJudgeProvider): parity program,
4 cases, 3 pass, 4th WA → hint `「奇偶判断」的输出与期望不符…` (contains
neither "even" nor "odd"); student output `actual=odd` is exposed.

### Route smoke - `node scripts/judge-route-smoke.mjs http://localhost:3159`

```
ok - T1 first 10 requests judged (got 10)
ok - T1 11th request -> 429 (got 429)
ok - T1 429 body error=RATE_LIMITED
ok - T1 Retry-After=57
ok - T2 all 4 concurrent requests accepted (queued, not rejected)
ok - T2 first-wave jobs each ~2s (min=3044ms)
ok - T2 4th job waited in queue ~4s (max=6010ms)
ok - T2 total wall 6011ms < 7s proves limit-3 queue, not serial 8s
ok - T3 big-output request judged (200)
ok - T3 truncation marker present
ok - T3 stdout capped near 1MB (1048602 chars)
ok - T4 AC sanity 20+22=42
ROUTE SMOKE OK
```

Interpretation:
- T1: 10 requests judged, 11th → 429 with `Retry-After: 57` (60s window) - 10/min per IP enforced.
- T2: 4 concurrent 2s jobs → first wave ~3s (2s sleep + compile), 4th ~6s
  (queued behind limit-3) - concurrency 3 enforced, excess queued not rejected.
- T3: 1.5 MB stdout → 1048602 chars = 1 MB + 26-char truncation marker.
- T4: AC path still judges correctly.

## Files

- src/lib/judge/harness.ts (new)
- src/app/api/judge/run/route.ts (updated)
- scripts/smoke-judge-harness.ts (new), scripts/judge-route-smoke.mjs (new)
- package.json (+p-limit 7.3.1)
