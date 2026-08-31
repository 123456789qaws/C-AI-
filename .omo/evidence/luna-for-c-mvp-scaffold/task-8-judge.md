# Task 8 Evidence - JudgeProvider 抽象与 /api/judge/run 契约

## Date: 2026-08-31

## Task

> `- [ ] 8. 定义 JudgeProvider 抽象与 /api/judge/run 契约`

Define `JudgeProvider` abstraction (types), `getJudgeProvider()` factory (JUDGE_MODE
auto/docker/local), and a thin `POST /api/judge/run` wrapper validating MAX_CODE_SIZE
64KB. No actual execution (todo 9).

## Files Created

| File | Purpose |
|------|---------|
| `src/lib/providers/judge/types.ts` | `Verdict` (`'AC'\|'WA'\|'CE'\|'RE'\|'TLE'`), `JudgeRunRequest`, `JudgeResult`, `JudgeProvider` interface — pure types, client-safe |
| `src/lib/providers/judge/index.ts` | `getJudgeProvider()` factory switching on `env.JUDGE_MODE`; server-only; returns clearly-marked CE stub until todo 9 |
| `src/app/api/judge/run/route.ts` | `POST` wrapper: zod validation, 64KB → 413, provider delegation, error wrapping |

## Contract

```ts
interface JudgeProvider {
  readonly name: string;
  run(req: JudgeRunRequest): Promise<JudgeResult>;
}
interface JudgeRunRequest {
  language: 'c';
  source: string;
  stdin?: string;
  limits?: { cpuTime?: number; memory?: number; timeoutMs?: number };
}
interface JudgeResult {
  status: Verdict;
  stdout: string;
  stderr: string;
  signal?: string;
  timeMs: number;
  memoryKb: number;
  valgrind?: string;
}
```

## Functional Verification (dev server :3100, live HTTP)

| # | Request | Expect | Result |
|---|---------|--------|--------|
| T1 | valid C + stdin | 200 CE stub | ✅ `{"status":"CE","stdout":"","stderr":"judge-lite runners not yet implemented (todo 9)","timeMs":0,"memoryKb":0}` |
| T2 | `language:"cpp"` | 400 INVALID_INPUT | ✅ `{"error":"INVALID_INPUT","message":"language must be \"c\""}` |
| T3 | body `not-json` | 400 INVALID_JSON | ✅ `{"error":"INVALID_JSON","message":"Request body must be valid JSON"}` |
| T4 | source 70000 chars | 413 CODE_TOO_LARGE | ✅ `{"error":"CODE_TOO_LARGE","message":"source exceeds maximum size of 65536 bytes"}` |
| T5 | source exactly 65536 chars | 200 (boundary inclusive) | ✅ CE stub |
| T6 | empty source | 400 | ✅ `{"error":"INVALID_INPUT","message":"source must not be empty"}` |

## Static Verification

```
pnpm exec eslint src/lib/providers/judge src/app/api/judge/run/route.ts  -> ESLINT_EXIT=0
pnpm exec prettier --check (3 judge files)                                -> PRETTIER_EXIT=0
pnpm lint                                                                 -> No ESLint warnings or errors (LINT_EXIT=0)
pnpm build                                                                -> Compiled successfully
```

Build route table (excerpt):

```
┌ ƒ /api/judge/run                     0 B                0 B
```

## Build Log (final passing run)

```
▲ Next.js 14.2.35
- Environments: .env

Creating an optimized production build ...
✓ Compiled successfully
  Linting and checking validity of types ...
  Collecting page data ...
  Generating static pages (12/12)
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
+ First Load JS shared by all            87.4 kB
```

## Notes

- Concurrent tasks (7: ai providers, 10/11: auth) were writing files during this task;
  their transient lint/type errors blocked two earlier full-build attempts. Final build
  passed once their in-flight files were cleaned up. This task's files passed every
  check independently (eslint/prettier/tsc) from the start.
- Stub provider answers `CE` for every submission so the HTTP contract is exercisable
  end-to-end before todo 9 lands real docker/local runners.
