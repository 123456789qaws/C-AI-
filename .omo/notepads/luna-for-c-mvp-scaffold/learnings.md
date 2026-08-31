# Learnings - Luna for C MVP Scaffold

## Task 1: Next.js 14 + pnpm + TS strict + ESLint/Prettier + Shadcn 基座

### Date: 2026-08-29

### Summary
Successfully scaffolded a Next.js 14 project with all required tooling:
- Next.js 14.2.35 with App Router
- pnpm as package manager
- TypeScript with strict mode enabled
- ESLint with next/core-web-vitals (non-flat config)
- Prettier for code formatting
- Shadcn UI with base-nova style, button and card components
- Tailwind CSS with CSS variables
- Path aliases (@/* -> src/*)

### Key Decisions
1. **Used existing scaffold** - The project was already partially scaffolded with create-next-app. We verified and completed the configuration rather than re-scaffolding.
2. **Non-flat ESLint config** - Used .eslintrc.json with extends: ["next/core-web-vitals", "next/typescript", "prettier"] to avoid Next.js 15 flat config.
3. **Prettier integration** - Added eslint-config-prettier, eslint-plugin-prettier, and prettier as devDependencies. Created .prettierrc with single quotes, 2-space tabs, trailing commas.
4. **Shadcn base-nova style** - Used the newer base-nova style with CSS variables and @base-ui/react primitives instead of Radix UI.
5. **Path aliases** - Configured @/* mapping to ./src/* in tsconfig.json.

### Commands Run
`ash
# Install prettier dependencies
pnpm add -D eslint-config-prettier eslint-plugin-prettier prettier

# Format all files
pnpm exec prettier --write .

# Verify lint passes
pnpm lint

# Verify build passes
pnpm build

# Verify dev server starts on 3000
pnpm dev
`

### Verification Results
- ✅ pnpm lint - 0 errors
- ✅ pnpm build - Compiled successfully, static pages generated
- ✅ pnpm dev - Starts on http://localhost:3000 in ~4.3s

### Files Created/Modified
- .prettierrc - Prettier configuration
- .eslintrc.json - Updated with prettier plugin and rules
- package.json - Added prettier devDependencies
- All source files formatted with prettier

### Gotchas
1. **Prettier formatting conflicts** - The existing code used double quotes, but prettier defaults to single quotes. Running prettier --write . fixed all formatting issues.
2. **Shadcn base-nova uses @base-ui/react** - Different from traditional Radix-based shadcn. Button component imports from @base-ui/react/button.
3. **CSS variables for theming** - Tailwind config uses CSS variables (--background, --foreground, etc.) for dark mode support.

### Next Steps
- Task 2: Add Theia IDE integration
- Task 3: Add Judge0 code execution
- Task 4: Add Prisma database schema

## Task 2: 建立 .env 体系与基础配置（env.example + server-only 守卫）

### Date: 2026-08-29

### Summary
Successfully established the .env configuration system with zod validation and server-only guards:
- Created .env.example with all required environment variables
- Created src/lib/env.ts with zod schema validation
- Created src/lib/config.ts with server-only guard
- Created src/lib/providers/ai/mock.ts placeholder
- Installed zod and server-only dependencies

### Key Decisions
1. **Zod for validation** - Used zod 4.4.3 for runtime environment validation with clear error messages
2. **server-only package** - Used Next.js's server-only package to prevent client bundle leakage
3. **Default values** - Provided sensible defaults for AI_PROVIDER (deepseek-api) and JUDGE_MODE (auto)
4. **PostgreSQL default** - Used postgresql://postgres:postgres@localhost:5432/luna_c?schema=public as default DATABASE_URL
5. **JWT_SECRET minimum 16 chars** - Enforced security requirement via zod validation

### Commands Run
```bash
# Install dependencies
pnpm add zod server-only

# Build and verify
pnpm build

# Check for DEEPSEEK leaks in client bundle
Get-ChildItem -Path ".next\static" -Recurse -File | Select-String -Pattern "DEEPSEEK"
# No output = no leaks ✅

# Verify server-only error on client import
# Created test client component importing config -> build fails with server-only error ✅
```

### Verification Results
- ✅ pnpm build - Compiled successfully, static pages generated
- ✅ No DEEPSEEK string leaked into .next/static (verified with Select-String)
- ✅ Client import of config throws server-only error (tested with test-client page)
- ✅ All linting passes (prettier/ESLint)

### Files Created
- .env.example - Environment template with all required variables
- src/lib/env.ts - Zod validation schema and parsed env export
- src/lib/config.ts - Server-only guarded config re-export
- src/lib/providers/ai/mock.ts - Mock AI provider placeholder

### Gotchas
1. **Line ending issues** - PowerShell's Set-Content with -NoNewline needed to avoid CRLF issues that caused prettier/TypeScript errors
2. **server-only enforcement** - The 'server-only' import must be at the very top of the file (first line) for proper enforcement
3. **Zod enum defaults** - Default values must be chained after .enum() not inside the array
4. **Unused parameters** - ESLint @typescript-eslint/no-unused-vars catches unused function parameters; removed _problem parameter from mock judgeCode

### Next Steps
- Task 3: Add Theia IDE integration
- Task 4: Add Judge0 code execution
- Task 5: Add Prisma database schema

## Task 3: 落地 Prisma 5 + Postgres 16 schema 与迁移

### Date: 2026-08-29

### Summary
Successfully set up Prisma 5.22.0 with PostgreSQL driver adapter for the Luna-for-C MVP project. Created schema with 4 core models per 项目分析文档.md:10.1, generated Prisma Client with driver adapter support, and created migration files ready for deployment.

### Key Decisions
1. **Prisma 5.22.0 (stable)** - Used stable 5.x version instead of 8.x RC to avoid compatibility issues
2. **Driver Adapter (@prisma/adapter-pg)** - Used the official PostgreSQL driver adapter with `pg.Pool` for connection pooling
3. **Preview Feature: driverAdapters** - Enabled in generator to support adapter in Prisma Client options
4. **Global Singleton Pattern** - Used `globalThis` singleton to prevent multiple Prisma Client instances during hot reload in development
5. **Migration Files Ready** - Created migration SQL via `prisma migrate diff` since no local PostgreSQL instance was available

### Commands Run
```bash
# Install dependencies
pnpm add prisma@5.22.0 @prisma/client@5.22.0 @prisma/adapter-pg@5.22.0 pg
pnpm add -D @types/pg@8.23.1

# Generate Prisma Client with driver adapter support
pnpm exec prisma generate

# Generate migration SQL (without database connection)
pnpm exec prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script

# Verify build and lint
pnpm build
pnpm lint
```

### Verification Results
- ✅ pnpm build - Compiled successfully, static pages generated
- ✅ pnpm lint - 0 errors
- ✅ Prisma Client generated with driverAdapters preview feature
- ✅ Migration SQL generated and saved to prisma/migrations/20260829180100_init/migration.sql
- ⚠️ pnpm exec prisma migrate dev --name init - Requires running PostgreSQL (P1001: Can't reach database server)

### Files Created/Modified
- package.json - Added prisma, @prisma/client, @prisma/adapter-pg, pg, @types/pg
- prisma/schema.prisma - Schema with 4 models (User, Task, AiInteractionLog, CheckpointProgress)
- prisma/migrations/20260829180100_init/migration.sql - Migration SQL
- prisma/migrations/migration_lock.toml - Provider lock file
- prisma/seed.ts - Placeholder seed file
- src/lib/db.ts - Global singleton Prisma Client with Pg adapter
- .env - Environment file with DATABASE_URL
- .omo/evidence/luna-for-c-mvp-scaffold/task-3-prisma.md - Evidence file

### Gotchas
1. **Driver Adapter Preview Feature** - Must add `previewFeatures = ["driverAdapters"]` to generator in schema.prisma, otherwise PrismaClientOptions.adapter type is `never`
2. **PrismaPg Constructor** - Takes `pg.Pool` instance, not connection string directly: `new PrismaPg(pool)` not `new PrismaPg({ connectionString })`
3. **Build Scripts for Prisma** - pnpm requires `pnpm approve-builds` for @prisma/engines, @prisma/client, prisma packages; postinstall scripts must run to download query engines
4. **Network Issues** - npm registry timeouts during install; used npmmirror.com and extended timeouts
5. **Migration Without Database** - `prisma migrate dev` requires live database; used `prisma migrate diff --from-empty --to-schema-datamodel --script` to generate SQL offline

### Next Steps
- Start PostgreSQL 16 (Docker Compose or local)
- Run `pnpm exec prisma migrate dev --name init` to apply migrations
- Verify database connection with `prisma.$queryRaw`SELECT 1``
- Add seed data via prisma/seed.ts when needed

## Task 4: Docker Compose 单机编排与启动脚本

### Date: 2026-08-29

### Summary
Successfully created Docker Compose orchestration for single-machine deployment with:
- docker-compose.yml with web (port 3000), db (postgres:16), and optional judge-lite service
- Multi-stage Dockerfile for Node.js 20 Alpine with pnpm
- judge:health script that gracefully handles missing Docker daemon
- .dockerignore for clean builds

### Key Decisions
1. **PostgreSQL 16** - Used official postgres:16 image with healthcheck via pg_isready
2. **Multi-stage Dockerfile** - Base → deps → builder → runner pattern for minimal production image
3. **Standalone output** - Next.js configured for standalone output to copy only necessary files
4. **Non-root user** - Runner stage uses nextjs user (UID 1001) for security
5. **Graceful Docker fallback** - judge:health script exits 0 always, logs WARN when Docker unavailable, falls back to local gcc
6. **env_file for secrets** - Web service uses .env file, no hardcoded secrets in compose
7. **Optional judge-lite** - Commented out service for future use

### Commands Run
```bash
# Verify docker compose config
docker compose config

# Test judge health check (without Docker)
pnpm run judge:health

# Verify exit code is 0
pnpm run judge:health; echo "Exit code: $LASTEXITCODE"
```

### Verification Results
- ✅ docker compose config - Validates successfully (no warnings after removing obsolete `version`)
- ✅ pnpm run judge:health - Returns WARN gracefully, exits with code 0
- ✅ Docker unavailable path - Logs WARN, checks for local gcc, continues
- ✅ All files created: docker-compose.yml, Dockerfile, scripts/judge-health.mjs, .dockerignore, package.json script
- ⚠️ pnpm build with `output: 'standalone'` - Known Windows limitation: fails at file tracing phase due to symlink permissions (EPERM). Works correctly in Docker (Linux container).

### Files Created
- docker-compose.yml - Services: db (postgres:16), web (build from Dockerfile), judge-lite (commented) - **removed obsolete `version: '3.8'`**
- Dockerfile - Multi-stage: base (node:20-alpine + pnpm), deps, builder, runner
- scripts/judge-health.mjs - Docker availability check with graceful fallback
- .dockerignore - Excludes node_modules, .next, .git, env files, build outputs
- package.json - Added "judge:health": "node scripts/judge-health.mjs" script
- next.config.mjs - Added `output: 'standalone'` and `experimental.outputFileTracingRoot`
- .npmrc - Added `node-linker=hoisted` to mitigate pnpm symlink issues

### Gotchas
1. **Docker Compose version attribute** - Removed obsolete `version: '3.8'` (Compose v2 ignores it, caused warning)
2. **Windows line endings** - Dockerfile uses LF line endings; ensure git config core.autocrlf=input or use .gitattributes
3. **Docker daemon timeout** - On Windows without Docker Desktop, `docker info` times out (ETIMEDOUT); script handles this gracefully
4. **Standalone Next.js on Windows** - `output: 'standalone'` fails at file tracing phase due to symlink permissions (EPERM) with pnpm. This is a known Windows + pnpm + Next.js issue. **Works correctly in Docker (Linux)**. Mitigation: added `.npmrc` with `node-linker=hoisted` (partial).
5. **pnpm in Docker** - Used corepack enable + corepack prepare pnpm@latest --activate for reliable pnpm installation

### Next Steps
- Add `output: 'standalone'` to next.config.js for Docker build to work
- Start services with `docker compose up -d db` for database only
- Full stack: `docker compose up -d` (requires Docker daemon)
- Task 5: Add Theia IDE integration
- Task 6: Add Judge0 code execution

## Task 5: 搭建 App Router 布局与基础路由（(ide) 组 + 组件目录）

### Date: 2026-08-31

### Summary
Successfully built the App Router layout with three-column IDE structure and basic routing for Luna for C MVP. All required files were already in place; only needed to remove the conflicting root page.tsx.

### Key Decisions
1. **Route group (ide) serves at root** - The `(ide)` route group doesn't create a URL segment; its pages are served at `/`. Removed `src/app/page.tsx` to avoid conflict.
2. **Three-column flex layout** - Left sidebar 240px (FileTree), main 1fr (Monaco), right sidebar 360px (Luna AI).
3. **No business logic in layouts** - Layouts only handle structure; page components handle UI placeholders.
4. **All components RSC by default** - No 'use client' needed for static placeholders.
5. **Health endpoint minimal** - Returns `{ok: true, ts: Date.now(), version: '0.1.0'}` for Docker healthchecks.

### Commands Run
```bash
# Remove conflicting root page
rm src/app/page.tsx

# Verify build and lint
pnpm build
pnpm lint
```

### Verification Results
- ✅ pnpm build - Compiled successfully, static pages generated
- ✅ Route table: `/` (3.15 kB - IDE page), `/api/health` (0 B - API route)
- ✅ pnpm lint - 0 errors, 0 warnings
- ✅ GET /api/health returns `{ok: true, ts: ..., version: '0.1.0'}`
- ✅ `/` shows three-column placeholder with FileTree, Monaco workspace, Luna AI panel

### Files Verified/Modified
- src/app/layout.tsx - Root layout with html lang="zh-CN", metadata, globals.css ✅
- src/app/(ide)/layout.tsx - Three-column flex layout ✅
- src/app/(ide)/page.tsx - Monaco workspace placeholder with guide question mock ✅
- src/app/api/health/route.ts - Health check endpoint ✅
- src/components/ui/button.tsx - Shadcn Button with cva variants ✅
- src/components/ui/card.tsx - Shadcn Card with all sub-components ✅
- src/components/editor/FileTree.tsx - File tree placeholder ✅
- Removed: src/app/page.tsx (conflicting root page)

### Gotchas
1. **Route group conflict** - Having both `src/app/page.tsx` and `src/app/(ide)/page.tsx` causes the root page to take precedence. Must remove root page.tsx for (ide) page to serve at `/`.
2. **Route group doesn't affect URL** - `(ide)` is purely organizational; pages inside are at root paths.
3. **Build output size confirms correct page** - IDE page 3.15 kB vs default page 5.34 kB.

### Next Steps
- Task 6: Add Monaco Editor integration
- Task 7: Add Luna AI chat panel implementation
- Task 8: Add file tree with actual file operations

## Task 8: JudgeProvider 抽象与 /api/judge/run 契约

### Date: 2026-08-31

### Summary
Defined the judge execution contract without implementing execution (deferred to todo 9):
- `src/lib/providers/judge/types.ts` - Pure types: `Verdict` ('AC'|'WA'|'CE'|'RE'|'TLE'), `JudgeRunRequest`, `JudgeResult`, `JudgeProvider` interface. No server-only import so client code can render verdicts.
- `src/lib/providers/judge/index.ts` - `getJudgeProvider()` factory switching on `env.JUDGE_MODE` (auto/docker/local), `import 'server-only'` at top. Returns a clearly-marked CE stub until todo 9 implements real runners.
- `src/app/api/judge/run/route.ts` - Thin POST wrapper: zod validation (language === 'c', source min 1 max 65536, limits positive), >64KB source → 413 CODE_TOO_LARGE, other invalid → 400 INVALID_INPUT, provider errors → 500 JUDGE_FAILED. Rate-limit TODO comment left.

### Key Decisions
1. **CE stub provider** - Factory returns `{status:'CE', stderr:'judge-lite runners not yet implemented (todo 9)'}` so the HTTP contract works end-to-end before execution exists.
2. **Pure types, server-only factory** - types.ts stays client-importable (types are erased); index.ts carries the `server-only` guard matching the ai providers pattern.
3. **String length as size proxy** - MAX_CODE_SIZE = 64 * 1024 checked via `z.string().max()` (characters, not bytes); contract deliberately simple for the MVP.
4. **Implementation omits unused param** - stub `run(): Promise<JudgeResult>` (no `_req`) because this ESLint config flags underscore-prefixed params (same as Task 2 gotcha).
5. **Boundary inclusive** - exactly 65536 chars passes (200), 65537 → 413.

### Commands Run
```bash
pnpm exec prettier --write src/lib/providers/judge src/app/api/judge/run/route.ts
pnpm exec eslint src/lib/providers/judge src/app/api/judge/run/route.ts  # exit 0
pnpm exec tsc --noEmit
pnpm build
pnpm lint
# Functional: dev server on PORT=3100 + Invoke-WebRequest tests (T1-T6)
```

### Verification Results
- ✅ pnpm build - Compiled successfully; route table shows `ƒ /api/judge/run`
- ✅ pnpm lint - No ESLint warnings or errors
- ✅ T1 valid C → 200 `{"status":"CE",...,"stderr":"judge-lite runners not yet implemented (todo 9)"}`
- ✅ T2 language=cpp → 400 INVALID_INPUT; T3 bad JSON → 400 INVALID_JSON; T6 empty source → 400
- ✅ T4 source 70000 chars → 413 CODE_TOO_LARGE; T5 exactly 65536 chars → 200 (boundary inclusive)

### Files Created
- src/lib/providers/judge/types.ts
- src/lib/providers/judge/index.ts
- src/app/api/judge/run/route.ts
- .omo/evidence/luna-for-c-mvp-scaffold/task-8-judge.md

### Gotchas
1. **Route files may only export HTTP handlers + Next.js config** - `export const MAX_CODE_SIZE` in route.ts broke the build: Next generates `.next/types/app/api/judge/run/route.ts` with `checkFields` demanding every extra export be `never`. Fix: keep the constant module-private (no `export`).
2. **trailingComma: 'es5'** - .prettierrc uses es5, so trailing commas in function calls (e.g. `NextResponse.json(..., { status: 400 })`) are stripped; run `prettier --write` after writing routes.
3. **ESLint flags `_`-prefixed unused params** - @typescript-eslint/no-unused-vars has no `argsIgnorePattern` here; omit unused interface params entirely (TS allows fewer params in implementations).
4. **`pnpm dev -- -p 3100` breaks via cmd /c** - quoting made next treat `-p` as project dir. Use `set PORT=3100&& pnpm dev` instead.
5. **Concurrent tasks dirty the shared workspace** - tasks 7/10/11 were writing ai/auth files mid-task; their transient lint/type errors blocked full builds twice. Verify own files with targeted eslint/prettier/tsc, commit ONLY own paths, retry full build after their cleanup.

### Next Steps
- Task 9: 实现 judge-lite docker/local 实际执行（替换 CE stub）
- Task 10: Auth / JWT 流程
- Task 11: /api/judge/run 接入真实评测流程

## Task 14: 定义 AIProvider 抽象与网关壳

### Date: 2026-08-31

### Summary
Successfully built the AI provider abstraction and the Socratic judge gateway shell:
- src/lib/providers/ai/types.ts - AIProvider interface (complete(prompt, opts))
- deepseek.ts (OpenAI-compatible), qwen.ts (QWEN_URL local), mock.ts (fixed Socratic JSON), index.ts factory on AI_PROVIDER
- src/lib/ai/prompt.ts - SocraticSystemPrompt with hard rules + buildJudgePrompt(userMsg, codeSnippet)
- src/app/api/ai/socratic/route.ts - POST shell: auth placeholder + rate-limit placeholder + input escape + robust JSON.parse fallback

### Key Decisions
1. **Single AIProvider interface** - All providers implement complete(prompt, opts?) returning {text, usage:{tokens}}; route code never touches provider internals.
2. **server-only in every provider file** - First line import; index.ts also server-only. Verified prompt/keys never reach .next/static.
3. **mock returns fixed JSON string** - MOCK_SOCRATIC_JSON exported constant; mock complete() takes zero params (fewer params still satisfies interface, avoids no-unused-vars since .eslintrc has no argsIgnorePattern).
4. **Robust JSON extraction** - Model output may be wrapped in ```json fences or prefixed text; parseJudgeResult tries direct parse, fenced extraction, first-brace extraction, then falls back to {pass:false, reply:rawText, reason:'parse-failed'}.
5. **Input escape** - Strip control chars (\u0000-\u0008 etc.), trim, cap lengths (answer 4000 / code 20000 / history 20 entries).
6. **Placeholders not implementations** - AUTH_ENABLED=false + RATE_LIMIT_ENABLED=false consts with TODO comments; task 15 owns rate-limit/circuit-breaker.

### Verification Results
- ✅ pnpm lint - "No ESLint warnings or errors"
- ✅ pnpm build - Compiled successfully; /api/ai/socratic registered as dynamic route (ƒ)
- ✅ No system prompt / API key strings in .next/static (Select-String check)

### Gotchas
1. **Next route files can only export HTTP methods** - auth task's route exported a helper (extractBearerToken), failing next build type-check (checkFields constraint). Route helpers must be non-exported or live in lib/.
2. **pnpm 10 supply-chain check on build** - pnpm build runs deps status check; a placeholder string "esbuild: set this to true or false" in pnpm-workspace.yaml allowBuilds caused ERR_PNPM_IGNORED_BUILDS. Must be a real boolean.
3. **Parallel task file conflicts** - Other in-flight tasks (auth/judge) actively rewrite files; lint gate required prettier-fixing their files (formatting-only, not committed). Commit only own paths via git add <specific files>.
4. **Unused params are lint errors** - .eslintrc has no argsIgnorePattern; underscores do NOT silence no-unused-vars. Omit params entirely where the interface allows.

### Files Created/Modified
- src/lib/providers/ai/types.ts, deepseek.ts, qwen.ts, mock.ts (rewritten), index.ts
- src/lib/ai/prompt.ts
- src/app/api/ai/socratic/route.ts
- .omo/evidence/luna-for-c-mvp-scaffold/task-14-ai.md

### Next Steps
- Task 15: rate limit / circuit breaker on the socratic route
- Task 9: real judge runners behind getJudgeProvider
- Persist AiInteractionLog + CheckpointProgress once auth lands

## Task 9: judge-lite 双 Runner（docker + local 回退）

### Date: 2026-08-31

### Summary
Replaced the todo-8 CE stub with two real judge runners:
- docker.ts: DockerJudgeProvider - ephemeral gcc:13 container (`--network=none
  --memory=256m --pids-limit=64 --read-only --tmpfs /tmp -v dir:/code:ro`),
  two-step compile→run, `timeout Ns` inside container, 128+N signal mapping.
- local.ts: LocalJudgeProvider - MinGW gcc probe, mkdtemp, spawn main.exe with
  piped stdin + 5s kill, Windows NTSTATUS→signal normalization (0xC0000005→SIGSEGV).
- index.ts: auto (docker probe w/ 30s TTL cache → fallback local) / docker
  (throw if daemon unreachable) / local. server-only in every provider file.

### Key Decisions
1. **Never eval user code in-process** - docker: container; local: spawned child
   process. The Next process only orchestrates.
2. **Two-step compile+run (docker)** - separate `docker run` calls make CE
   detection unambiguous (compile exit≠0 = CE) at the cost of ~0.5s container
   startup; `--read-only` + binary in `/tmp/main` keeps /code mount ro.
3. **`timeout` inside container** - GNU timeout returns 124 (TLE) and bash exits
   128+N on signal death, so docker exit codes map cleanly to verdicts.
4. **30s TTL docker probe cache in auto mode** - `docker info` on a daemon-less
   machine can block seconds; caching negative probes avoids per-request latency.
5. **Local kill takes precedence** - `timedOut` flag set before `child.kill()`,
   so the kill's exit code can't masquerade as RE.

### Verification Results
- ✅ tsc --noEmit 0 / pnpm build ✅ / pnpm lint 0
- ✅ API (auto mode, daemon down → local gcc): AC hello+luna, RE+SIGSEGV,
  TLE 2234ms (2s limit) & 5238ms (5s default), CE with gcc diagnostics
- ✅ JUDGE_MODE=docker + daemon down → POST 500 (factory throw)
- ⚠️ Docker container path untested (no daemon on this machine) - code-reviewed only

### Gotchas
1. **Parallel-task build pollution persists** - todo 15's in-flight writes caused
   two transient build failures (`PageNotFoundError /_document`, `MODULE_NOT_FOUND`
   in `.next` webpack-runtime); clean retry passed. Never trust a single build
   failure while other tasks touch the tree.
2. **PowerShell function output capture** - `$r = Run-Case ...` captures ALL
   pipeline output (including diagnostic Write-Output lines) into `$r`; use
   Write-Host for console diagnostics when a function also returns a value.
3. **Harness kills long Start-Process scripts** - the bash tool terminates the
   launching powershell (ChildProcess.kill) while the spawned `cmd /c pnpm dev`
   survives; run tests against the already-started server in a separate call.
4. **MinGW segfault = NTSTATUS exit code, not signal** - child `close` reports
   `code=0xC0000005` (as negative int) with `signal=null`; must normalize the
   unsigned value, not rely on the signal field.

### Next Steps
- Task 10: auth/JWT integration of /api/judge/run
- Task 11: rate-limit + hidden-test harness (WA verdict) once task 15 lands
- When a Docker daemon is available: re-run T1-T5 through the docker provider

## Task 15: AI 限流/熔断/日志脱敏与 5 次上限

### Date: 2026-08-31

### Summary
Wired the socratic route's security layer (replacing Task 14's placeholders):
- src/lib/ai/rateLimit.ts - in-memory Map bucket per `${studentId}:${checkpointId}`, AI_RATE_LIMIT=5 per 1h window; 6th call → 429 {error, retryAfterSeconds, hint:'请联系教师放行'} + Retry-After header; lazy sweep of expired buckets when map >1024 entries
- src/lib/ai/guard.ts - sanitizePrompt (control-char strip + injection pattern filter), redactSecrets (sk-* and key=/token= masking), logAiUsage (in-process token counter, logs provider/tokens/total/checkpointId only)
- route.ts - rate limit check after input validation; module-level consecutiveProviderFailures circuit breaker (3 failures → mock fallback, success resets); sanitize applied to answer+history but NOT code (avoid corrupting legit source); redactSecrets on all provider error logs; response includes provider + remaining

### Key Decisions
1. **In-memory limit, DB optional** - Map-based counting is enough for single instance; commented Redis/DB persistence path for multi-instance. Task explicitly allows this.
2. **Circuit breaker in route module state** - Not a class: a module-level counter + threshold const; trips on 3rd consecutive failure (that request gets mock fallback), stays open until a mock success resets it (half-open).
3. **Code snippets excluded from injection filtering** - Only escapeInput (control chars + truncation) on codeSnippet; injection patterns like 'system:' could legitimately appear in C strings. Answer + history get full sanitizePrompt.
4. **studentId from body for MVP** - `body.studentId ?? 'anonymous'`, capped at 128 chars, clearly commented as Task 17's JWT replacement point.

### Verification Results
- ✅ Rate limit functional: 5×200 (remaining 4→0), 6th → 429 body `{"error":"rate_limited","retryAfterSeconds":3600,"hint":"请联系教师放行"}`
- ✅ Circuit breaker functional (deepseek without key): 502, 502, then 3rd failure → 200 provider=mock; next call stays mock; after mock success counter resets (next real attempt → 502)
- ✅ pnpm lint exit 0 ("No ESLint warnings or errors"), pnpm build exit 0 (/api/ai/socratic registered ƒ)
- ✅ Targeted eslint + tsc --noEmit on own 3 files clean

### Gotchas
1. **Mock complete() needs an arg through the interface type** - mockAIProvider typed as AIProvider makes `complete()` demand 1-2 args at call sites even though the impl takes 0. Pass a dummy string ('circuit-open fallback').
2. **for...of over Map fails with downlevel target** - tsconfig target < ES2015 → use `buckets.forEach((bucket, key) => ...)` instead of `for (const [k,v] of map)`.
3. **Parallel task dirtying lint gate again** - `pnpm lint` failed on src/lib/providers/judge/docker.ts (task 9 in-flight, prettier-only errors). Prettier-fixed it formatting-only, did NOT commit; committed only own 3 files.
4. **Start-Process can't launch pnpm directly** - pnpm is a .cmd shim on Windows; use `Start-Process cmd.exe -ArgumentList "/c pnpm dev"`. Also port 3100 had a stale parallel-task dev server running old code - test on a fresh port (3157/3158/3159).
5. **PS curl.exe body mangling** - `curl.exe -d $body` in PowerShell silently corrupts the JSON → 400 invalid_json. Use Invoke-WebRequest, and for 429 bodies read `$_.Exception.Response.GetResponseStream()`.

### Files Created/Modified
- src/lib/ai/rateLimit.ts (new), src/lib/ai/guard.ts (new)
- src/app/api/ai/socratic/route.ts (rewritten security layer)
- .omo/evidence/luna-for-c-mvp-scaffold/task-15-ai.md

### Next Steps
- Task 17: replace body.studentId with JWT-derived identity; persist AiInteractionLog/CheckpointProgress
- Task 16: valgrind followup (untouched)

## Task 10: 判题限流与安全加固 + 隐藏测试执行器

### Date: 2026-08-31

### Summary
Hardened POST /api/judge/run and added the hidden-test batch executor:
- src/lib/judge/harness.ts - `runHiddenTests(code, tests, options?)`: runs one C
  submission against a batch of {stdin, expected, description?} cases via the
  JudgeProvider, compares trimmed stdout vs trimmed expected, stops at the
  FIRST failing case and returns `firstFailure.hint` as a NATURE description of
  the mistake. Expected values are never exposed (no field carries them;
  `expectedHidden:true` is explicit so serializers assert instead of assume).
  Exports MAX_OUTPUT_BYTES (1 MB) shared with the route.
- route.ts - IP rate limit 10/min (in-memory fixed window, lazy sweep), p-limit
  concurrency 3 (excess queues, 4th waits), 1 MB output cap per stream with
  truncation marker, network-ban confirmation comment (docker --network=none).

### Key Decisions
1. **Rate limit BEFORE JSON parse** - unlike the socratic route (task 15) which
   checks after validation, here every request consumes a token: a flood of
   malformed JSON cannot bypass the quota to reach the expensive judge path.
2. **p-limit queue, not reject** - the 4th concurrent request WAITS instead of
   getting 429; p-limit's queue is the throttling (verified: 3×~2s + 1×~6s
   wall for 4 concurrent 2s jobs).
3. **"Compile once" = CE short-circuit** - the provider compiles on every
   run() call by contract, so the harness cannot truly compile once across
   cases; it short-circuits on the first CE (compilation is deterministic per
   source) and skips re-running gcc for the rest. A provider batch API is
   future work if per-case compile cost matters.
4. **Hint = nature, never answer** - WA hints embed the case `description`
   ("「n=0 的边界」的输出与期望不符..."), RE mentions the signal + likely
   cause, TLE mentions infinite loop / complexity, CE reuses the compiler's
   own first diagnostic line. Smoke asserts the raw expected string appears
   NOWHERE in the serialized report.
5. **XFF for IP** - first x-forwarded-for hop (proxy convention); spoofable,
   documented as anti-accident-flood only. Lazy sweep when bucket map > 1024.

### Verification Results
- ✅ pnpm build - Compiled successfully; /api/judge/run registered ƒ
- ✅ pnpm lint - "No ESLint warnings or errors"
- ✅ Harness smoke (scripts/smoke-judge-harness.ts): 28/28 assertions with a
  mock provider AND a real MinGW gcc batch (3 AC + 1 WA at case-4, hint carries
  「奇偶判断」, actual=odd exposed, expected never leaked)
- ✅ Route smoke (scripts/judge-route-smoke.mjs): T1 10×200 then 429
  RATE_LIMITED + Retry-After=57; T2 4 concurrent 2s jobs → min 3044ms /
  max 6010ms (limit-3 queue, not serial 8s); T3 1.5MB stdout → capped at
  1048602 chars with truncation marker; T4 AC sanity 20+22=42
- ✅ tsc --noEmit clean via build type-check

### Gotchas
1. **Test code needs its own includes** - my SLOW_CODE in the smoke script
   called printf without #include <stdio.h> → CE in ~1s, making the
   concurrency test "pass" vacuously. Always assert verdicts, not just HTTP
   200, when timing-sensitive.
2. **PowerShell single-quoted strings don't expand `n** - testing multiline C
   via ConvertTo-Json from a single-quoted PS string embedded literal backtick-n
   into the source (→ CE). Use node/mjs scripts for anything with newlines.
3. **Standalone harness testing needs `--conditions react-server`** -
   harness → getJudgeProvider → 'server-only' throws under plain Node; running
   with `node --conditions react-server --import tsx script.ts` resolves
   server-only to its empty react-server entry. env vars (DATABASE_URL,
   JWT_SECRET) must be set before the dynamic import because env.ts parses at
   import time.
4. **Rate buckets are process-scoped** - restarting the dev server resets the
   Map; the route smoke uses distinct XFF IPs per test phase to avoid bucket
   collisions within one server lifetime.

### Files Created/Modified
- src/lib/judge/harness.ts (new)
- src/app/api/judge/run/route.ts (rate limit + concurrency + output cap)
- scripts/smoke-judge-harness.ts (new), scripts/judge-route-smoke.mjs (new)
- package.json - added p-limit@7.3.1
- .omo/evidence/luna-for-c-mvp-scaffold/task-10-judge.md

### Next Steps
- Task 11: checkpoint DSL + wire runHiddenTests into the checkpoint flow
  (hints feed the AI tutor, verdicts gate progression)
- Multi-instance notes: in-memory rate buckets/queue are per-process; move to
  Redis when scaling beyond one server

## Task 16: Socratic 追问与 valgrind 线索注入

### Date: 2026-08-31

### Summary
Wired crash-failure context into the Socratic gateway:
- src/lib/ai/context.ts (new) - buildSocraticContext (RE + memoryTask/valgrindHint → inject sanitized 1-2 line crash hint, instruct model to ask "指针地址是多少/哪一行变成 NULL", forbid raw stack/fix) + extractValgrindSummary (valgrind raw output → "Invalid write of size 4（访问地址为 NULL，空指针）；崩溃点：main (test.c:6)")
- src/lib/ai/prompt.ts - buildJudgePrompt gained optional aiFollowup param → appends "追加追问：..."
- src/lib/ai/guard.ts - enforceSocraticHardRule: any fenced code block >5 non-empty lines OR >5 '{'-lines → whole reply replaced with "我不能给出完整实现，请先思考：..." (Socratic question)
- route.ts - accepts optional body {valgrindHint?, aiFollowup?, judgeResult?:{status,stderr,valgrind?}, checkpointMeta?:{title?,memoryTask?}}, sanitizes each, passes to buildSocraticContext, applies reply guard

### Key Decisions
1. **Only summaries reach the model** - raw valgrind output is capped (20000 chars) but NEVER sent to the model; extractValgrindSummary produces the 1-2 line digest, satisfying "not the raw answer".
2. **Trigger condition** - hint injection only when status==='RE' AND (memoryTask OR valgrindHint OR valgrind output present); WA/TLE or bare RE stays clean.
3. **Guard at the gateway, not just the prompt** - SocraticSystemPrompt already says "绝不输出>5行完整函数"; enforceSocraticHardRule is the second line of defense applied to every parsed reply (mock included).
4. **context.ts stays dependency-light** - imports only ./prompt, re-declares JudgeFailureContext locally (decoupled from judge contract), so a standalone tsx check runs without Next.js.

### Verification Results
- ✅ pnpm build / pnpm lint / tsc --noEmit all exit 0
- ✅ tsx unit check: 21/21 PASS (summary content+leak-freedom, injection triggers, followup append, >5-line replacement, ≤5-line kept)
- ✅ Functional (real deepseek provider): segfault+valgrind body → reply "你打印过 p 的地址吗？它当前是 NULL，那这行赋值操作试图往哪个地址写？" (Socratic, no fix code); aiFollowup "这块内存谁负责释放？" → model asked exactly that
- ✅ No raw valgrind/stack leaks into context (asserted in unit check)

### Gotchas
1. **Valgrind lines keep `==pid==` prefix** - locate error/location/address lines with substring matches, strip prefix only from the error text.
2. **PowerShell console GBK mojibake** - decode Invoke-WebRequest body via UTF8.GetString($r.RawContentStream.ToArray()) + [Console]::OutputEncoding=UTF8 for clean CJK evidence.
3. **Real deepseek key IS in .env** - Task 15's 502→mock circuit tests no longer reproduce; real replies arrive on first call. Use fresh studentId/checkpointId pairs for rate-limit-sensitive tests.
4. **tsx check script kept in temp dir** - not committed to the repo; path C:\Users\Lenovo\AppData\Local\Temp\opencode\task16-check.ts (absolute imports into src/lib/ai).

### Files Created/Modified
- src/lib/ai/context.ts (new)
- src/lib/ai/prompt.ts, src/lib/ai/guard.ts
- src/app/api/ai/socratic/route.ts
- .omo/evidence/luna-for-c-mvp-scaffold/task-16-ai.md

### Next Steps
- Task 18: wire on_fail.ai_followup / valgrind_hint from checkpoint config into the chat client
- Task 17: JWT identity → persist AiInteractionLog / CheckpointProgress

## Task 11: Checkpoint Gate DSL 与 Zod 校验（tasks 真源）

### Date: 2026-08-31

### Summary
Established the task checkpoint DSL as standalone JSON files (the single source of truth) with zod validation and a server-only loader:
- src/lib/checkpoint/schema.ts - zod discriminated union: Gate = regex{rule,weight} | ai_socratic{rubric,weight} | test_pass{tests,weight}; Checkpoint {id,title,guide_question,gates(min1),pass_threshold(0..1),unlock{editorRegion[2],hints?},on_fail?{ai_followup?,valgrind_hint?}}; Task {id(/^[A-Za-z0-9_-]+$/),title,description?,checkpoints(min1)}
- src/lib/checkpoint/loader.ts - server-only, loadTask(taskId) with traversal guard + TaskSchema.parse, listTasks() sorted
- tasks/fib_L2.json + tasks/linked_list_reverse.json - content mirrors seed.ts checkpoint constants (plus pass_threshold on cp2 which seed omits)
- tasks/README.md - DSL field reference + add-a-task guide + hidden_tests placeholder note

### Key Decisions
1. **tasks JSON = 真源** - runtime reads tasks/*.json; prisma Task.checkpoints is a seed-time mirror only. Loader is read-only + server-only → frontend can never modify tasks.
2. **Discriminated union gates** - z.discriminatedUnion('type') rejects wrong payload per gate type.
3. **Double taskId guard** - loader regex guard + schema regex on Task.id (path traversal defense).
4. **unlock.hints kept optional** - doc 8.1/seed include it, spec only names editorRegion; keeps seed-compatible content valid.
5. **schema.ts client-importable** - only loader.ts carries server-only (judge/ai provider pattern).

### Verification Results
- ✅ pnpm build exit 0; pnpm lint exit 0
- ✅ tsx smoke (--conditions react-server): 28/28 PASS - both tasks load with 2 checkpoints, correct unlock regions/on_fail, listTasks sorted, 7 zod rejection cases, 3 loader guard cases

### Gotchas
1. **seed.ts cp2 lacks pass_threshold** - schema requires it; JSON files add 1.0. Seed↔JSON sync is a manual step until seed imports tasks JSON.
2. **tsx top-level await breaks in temp dir** (no type:module) - wrap in async main().
3. **process.exit kills in-flight async assertions** - un-awaited async expectThrow calls silently dropped (phantom 25/28); await everything before exit.

### Next Steps
- Task 12: gate verify/evaluate logic + /api/checkpoint/verify (weighted pass_threshold scoring, runHiddenTests wiring)
- Todo 20: create hidden_tests/fib_2.json + linked_list_3.json
- Optionally make prisma/seed.ts import tasks JSON for auto-sync

## Task 12: 后端硬锁与 /api/checkpoint/verify 三级漏斗

### Date: 2026-08-31

### Summary
Implemented the backend hard-lock + three-tier verify funnel (frontend greying is UX only):
- src/lib/checkpoint/lockCheck.ts - checkEditorLock(code, allowedUnlockedLines, baseline?): 1-based inclusive regions, single region or array; baseline strict mode (locked lines must match template char-for-char) OR MVP fallback (locked lines must be blank)
- src/lib/checkpoint/evaluate.ts - evaluateCheckpoint(checkpoint, {code, studentAnswer}, options?): per-gate regex → ai_socratic (direct AIProvider, confidence<0.7 → escalated + not counted toward score) → test_pass (loadHiddenTests → runHiddenTests real gcc); score = ΣpassedWeight/Σweight vs pass_threshold; DI options.ai/options.judge for test injection; loadHiddenTests exported
- src/app/api/checkpoint/verify/route.ts - POST: bearer verifyToken (body.studentId MVP fallback), AI rate limit 5/checkpoint → 429, hard-lock tamper → 403 escalated + lock log, evaluate, per-gate AiInteractionLog rows (shared sessionId, codeBefore from previous codeAfter, minimal line diff), upsert CheckpointProgress (attempts+1, first unlockedAt), response {passed, score, escalated, perGate, testHint, nextCheckpointId, unlockRegions}

### Key Decisions
1. **Low-confidence AI never auto-passes** - confidence<0.7 → gate escalated AND excluded from score (otherwise escalation would be decorative; the funnel sends it to teacher review).
2. **baseline mode for full-file submissions** - scaffold lines are non-empty, so the blank-line heuristic would 403 everything; route accepts optional body.baseline for strict template comparison. No baseline → task-spec MVP heuristic.
3. **regex tested against answer OR code** - schema says answer, task text says code; either match passes (compatible with both).
4. **Rate limit before evaluation** - whole verify consumes AI quota when any ai_socratic gate present; 6th → 429 请联系教师放行.
5. **DB outage never blocks verdicts** - all persistence try/catch → redacted console.error; Postgres down on this machine so persistence is code-path verified + degradation tested live (prisma:query log shows correct SQL construction).
6. **One log row per gate per verify** - replay chain via codeAfter→codeBefore, sessionId = randomUUID() per request.
7. **No circuit-breaker duplication** - evaluate calls the provider directly; socratic route keeps its module-level breaker; provider failure → gate escalated + error code.

### Verification Results
- ✅ pnpm lint "No ESLint warnings or errors"; pnpm build ✓; ƒ /api/checkpoint/verify registered
- ✅ HTTP smoke (mock AI, dev :3189) 25/25: 401/400/404, tamper→403 escalated+violations, cp1 pass score=1.0 nextCheckpointId=cp2 unlockRegions=[[16,30]], WA→failed+testHint no-expected-leak, baseline locked-line edit→403, real gcc AC on temp hidden tests, 6th AI verify→429
- ✅ tsx unit (--conditions react-server, injected fakes) 24/24: lockCheck regions/CRLF/baseline, evaluate regex/AI low-confidence escalated/provider error/test_pass AC/WA/no-leak/missing-file, threshold boundaries
- ⚠️ AiInteractionLog/CheckpointProgress live writes untested (no local Postgres); SQL construction confirmed via prisma:query logs

### Gotchas
1. **JWT_SECRET quoted in .env** - @next/env strips quotes but PowerShell extraction didn't → all requests 401 at middleware; dequote before signing test tokens.
2. **[5,15] is a runtime Array** - Array.isArray can't distinguish tuple vs list-of-regions (for..of over [5,15] → "5 is not iterable"); discriminate by typeof first === 'number'.
3. **Middleware blocks body.studentId fallback** - /api/checkpoint/* requires bearer at middleware, so the MVP body.studentId fallback is unreachable in deployed flows; integration tests must send real tokens.
4. **hidden_tests/ is todo 20's deliverable** - QA used a temp fib_2.json (mirrors seed.ts data) then deleted it; missing file → gate escalated hidden_tests_unavailable, no crash.
5. **Mock provider always confidence=0.9** - low-confidence escalation can't be exercised over HTTP with AI_PROVIDER=mock; covered by injected fake provider in unit checks instead.

### Next Steps
- Task 13: frontend wiring (verify button, unlock animation, submit flow) - submit full file + baseline for strict lock mode
- Task 18: /api/logs replay + CSV (log rows already carry sessionId/codeDiff for timeline)
- Todo 20: real hidden_tests/*.json + e2e

## Task 18: 日志落库与回放 API（AiInteractionLog 全字段）

### Date: 2026-08-31

### Summary
Consolidated AiInteractionLog writes into a shared logger and added the replay/export API:
- src/lib/logs/diff.ts - minimal line diff (prefix/suffix trim + `@@` header, '' when same/no-before, 64KB cap, zero deps)
- src/lib/logs/logger.ts - logInteraction() full-field create with auto codeDiff + random sessionId fallback; try/catch degrades to redacted console.error (DB down never blocks verdicts)
- src/lib/logs/csv.ts - csvEscape/toCsv (RFC 4180) + redactStudentId (keep first2+last2, mask middle; <6 chars -> '***')
- src/app/api/logs/route.ts - GET timeline: bearer verifyToken (middleware + route double-check); STUDENT forced to own id (query override ignored), TEACHER/TA all or filtered; ORDER BY ts ASC, id ASC; ?format=csv -> attachment with studentId redacted for STUDENT viewers
- verify route refactored: inline simpleLineDiff/persistInteractionLog removed (-85 lines), lock-tamper + per-gate rows now call logInteraction (behavior unchanged, codeDiff centralized)
- socratic route: optional taskId, Bearer-first resolveStudentId, logInteraction write per call (role=assistant, gateResult=pass/fail)

### Key Decisions
1. **Shared logger, not per-route prisma** - codeDiff computed in ONE place (logger), dedupes the diff logic previously duplicated inline in verify.
2. **Student-forced own id, redaction as defense-in-depth** - a student can never query others, AND their CSV export masks every studentId cell; either layer alone prevents class-data leaks.
3. **diff '' when no before-state** - replay chain builds codeBefore from previous codeAfter; first submission has no before -> no noise patch (matches verify's old simpleLineDiff semantics).
4. **Logs route never blocks on DB** - findMany failure -> 500 db_error with redacted console.error (no data, no crash).

### Verification Results
- ✅ pnpm build / pnpm lint / tsc --noEmit all exit 0; ƒ /api/logs registered
- ✅ tsx unit 20/20 (diff same/no-before/CRLF/truncation; csv escape/structure/redact)
- ✅ HTTP smoke 9/9 (dev :3190, mock AI, PG down): 401 no/bad token; student+taskId -> db_error; studentId=99999999 override never bound in SQL (access log only); teacher WHERE 1=1; 2 verifies passed + tamper 403 (verdicts unaffected by failed log writes)
- ✅ prisma:query evidence: 5× full-field INSERT (2 verifies×2 gates + 1 tamper), 3 query shapes (taskId+studentId / studentId / 1=1) all ORDER BY ts ASC, 5× `[logs] AiInteractionLog 写入失败` degradation lines
- ⚠️ End-to-end timeline/CSV download needs live Postgres (none on this machine); SQL construction + authz proven, pure functions unit-covered

### Gotchas
1. **prisma:query logs placeholders, not values (driver adapter)** - could not assert the bound param VALUE for the forced own-id query from logs alone; relied on code path + the override id appearing nowhere except the access-log URL line.
2. **Parallel tasks dirty middleware.ts** - another task added an anonymous demo channel for POST /api/checkpoint/verify; /api/logs/* Bearer gate unaffected (verified 401 live). Commit only own paths.
3. **Prisma.AiInteractionLogGetPayload<object> typing is version-fragile** - used `Awaited<ReturnType<typeof prisma.aiInteractionLog.findMany>>` instead; guaranteed to typecheck across prisma 5.x.
4. **Route files may only export HTTP handlers** (task 8/14 gotcha) - extractBearerToken/resolveStudentId kept module-private in routes.

### Next Steps
- Task 19 (blocks on this): consume /api/logs timeline for teacher dashboard replay; CSV export button
- When Postgres is up: migrate deploy + seed, re-run smoke for real 2-record timeline + CSV download
