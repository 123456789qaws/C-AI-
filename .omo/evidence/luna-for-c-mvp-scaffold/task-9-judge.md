# Task 9: judge-lite 双 Runner (docker + local 回退)

## Date: 2026-08-31

## What Was Built

Replaced the todo-8 CE stub with two real judge runners behind `getJudgeProvider()`:

- `src/lib/providers/judge/docker.ts` - `DockerJudgeProvider` (name `judge-docker`)
- `src/lib/providers/judge/local.ts` - `LocalJudgeProvider` (name `judge-local`)
- `src/lib/providers/judge/index.ts` - factory wiring auto/docker/local modes

User code is NEVER executed inside the Next.js process: docker mode compiles and
runs in an ephemeral `gcc:13` container, local mode spawns a separately compiled
`main.exe` as a child process with piped stdin.

## Design

### docker.ts
- Submission dir (`mkdtemp(os.tmpdir())`) contains `main.c` + `input.txt`, mounted
  read-only at `/code`; binary compiled to `/tmp/main` on the `--tmpfs /tmp` mount.
- Container flags: `--rm --network=none --memory=256m --pids-limit=64 --read-only --tmpfs /tmp`
- Two-step: (1) `gcc -std=c11 -Wall -Wextra -O2 main.c -o /tmp/main` → non-zero exit = CE;
  (2) `timeout Ns /tmp/main < input.txt` → GNU timeout exits 124 = TLE.
- Exit mapping: 0=AC, 124=TLE, 128+N=RE with `SIGNAL_NAMES[N]` (SIGSEGV=139, SIGABRT=134,
  SIGKILL=137), other non-zero=RE; execFile failure without child exit code rethrows
  so the route answers 500 JUDGE_FAILED instead of faking a verdict.
- Windows path caveat: `dir.replace(/\\/g, '/')` for the `-v` mount (Docker Desktop
  accepts `C:/...`). Compile warnings prepended to run stderr.
- `isDockerDaemonAvailable()` = `execFileSync('docker info --format {{.ServerVersion}}')`
  in try/catch, used by the auto-mode probe.

### local.ts
- gcc probed once per process via `execFileSync('gcc --version')`; missing gcc →
  CE with `'gcc not found, install MinGW-w64 (...)'` (no throw).
- `mkdtemp` dir → write `main.c` → `gcc -std=c11 -Wall -Wextra -O2 main.c -o main.exe`
  → `spawn(main.exe)` with piped stdin, 5s default wall-clock kill (setTimeout +
  child.kill()), maxBuffer capped at 5MB with truncation marker.
- Windows NTSTATUS normalization: `0xC0000005` (access violation) → SIGSEGV,
  `0xC00000FD` (stack overflow) → SIGSEGV, `0xC0000094` (int div-by-zero) → SIGFPE.
  kill-on-timeout flag takes precedence over the exit code → TLE.
- valgrind: not available locally (field omitted).

### index.ts
- `auto`: probe docker daemon (TTL cache 30s to avoid paying probe latency per
  request) → docker provider, else local.
- `docker`: throws `Error('JUDGE_MODE=docker but the docker daemon is unreachable...')`
  when the probe fails → route answers 500.
- `local`: always local.
- `import 'server-only'` first line in every file (docker/local/index), types.ts
  stays pure/client-importable.

## Verification Results

Environment: Windows, gcc 15.2.0 (MinGW-w64) present, Docker CLI present but
daemon NOT running → auto mode exercised the local fallback end-to-end.

### Build gates
- ✅ `pnpm exec tsc --noEmit` - exit 0
- ✅ `pnpm build` - compiled, route table includes `ƒ /api/judge/run`
- ✅ `pnpm lint` - "No ESLint warnings or errors"
- Note: two transient build failures (`PageNotFoundError /_document`,
  `MODULE_NOT_FOUND` in `.next` webpack-runtime) were caused by a parallel task
  (todo 15) writing ai/auth files mid-build; clean retry passed (see learnings).

### Functional (dev server PORT=3200, real HTTP through /api/judge/run, JUDGE_MODE=auto)

| Case | Payload | Result | Expectation |
|------|---------|--------|-------------|
| T1 AC | hello-world `printf("hello %s")` + stdin `luna` | `AC`, stdout `hello luna`, 506ms | ✅ AC |
| T2 RE | `int *p=0; *p=1;` | `RE`, `signal=SIGSEGV`, 483ms | ✅ RE+SIGSEGV |
| T3 TLE | `for(;;){}` + `timeoutMs:2000` | `TLE`, 2234ms | ✅ TLE at 2s |
| T4 TLE | `for(;;){}` (no limits) | `TLE`, 5238ms, stderr `timed out after 5s` | ✅ TLE default 5s |
| T5 CE | missing `;` | `CE`, gcc `error: expected ';'` diagnostics | ✅ CE |
| T6 docker-mode | `JUDGE_MODE=docker`, daemon down | POST → HTTP 500 (factory throw) | ✅ throw if unavailable |

auto→local fallback proven by construction: the docker daemon was down for the
entire test run, and T1-T5 all returned real verdicts from the local runner.

### Not tested (requires Docker daemon / covered by code review only)
- Docker container path (daemon unavailable on this machine): compile+run flags,
  128+N signal mapping, `timeout` 124, `/code:ro` mount.
- gcc-missing CE message (gcc IS installed here): probe returns false → CE stub path.

## Files Created/Modified
- `src/lib/providers/judge/docker.ts` (new)
- `src/lib/providers/judge/local.ts` (new)
- `src/lib/providers/judge/index.ts` (stub → real factory)
