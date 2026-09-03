import 'server-only';

import { execFile, execFileSync, spawn } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

import type { JudgeProvider, JudgeResult, JudgeRunRequest } from './types';

const execFileAsync = promisify(execFile);

const COMPILE_TIMEOUT_MS = 20_000;
const DEFAULT_WALL_MS = 5_000;
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024;

const GCC_MISSING_STDERR =
  '本地未找到 gcc：已自动尝试本地编译但失败。请安装 MinGW-w64（`winget install BrechtSanders.WinLibs.POSIX.UCRT`）并重启服务，或设置 LOCAL_GCC_PATH 指向 gcc 可执行文件';

/**
 * Resolve the gcc binary: explicit LOCAL_GCC_PATH wins (custom MinGW install
 * location), otherwise fall back to `gcc` on PATH. Never hardcode an
 * absolute Windows path - the env var keeps it configurable.
 */
export function resolveGccBinary(): string {
  const fromEnv = process.env.LOCAL_GCC_PATH?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : 'gcc';
}

/** Lazily probed once per process; a fresh install requires a server restart. */
let gccAvailable: boolean | null = null;
let probedBinary: string | null = null;

export function probeGcc(): boolean {
  const bin = resolveGccBinary();
  if (gccAvailable !== null && probedBinary === bin) return gccAvailable;
  try {
    execFileSync(bin, ['--version'], {
      timeout: 5_000,
      stdio: 'ignore',
      windowsHide: true,
    });
    gccAvailable = true;
  } catch {
    gccAvailable = false;
  }
  probedBinary = bin;
  return gccAvailable;
}

/**
 * Windows reports crashes as NTSTATUS exit codes (unsigned). Normalize the
 * well-known ones to POSIX-style signal names so callers get RE + signal.
 */
function crashSignalFromCode(code: number): string | undefined {
  const u = code < 0 ? code + 0x100000000 : code;
  switch (u) {
    case 0xc0000005:
      return 'SIGSEGV'; // STATUS_ACCESS_VIOLATION
    case 0xc00000fd:
      return 'SIGSEGV'; // STATUS_STACK_OVERFLOW
    case 0xc0000094:
      return 'SIGFPE'; // STATUS_INTEGER_DIVIDE_BY_ZERO
    default:
      return undefined;
  }
}

interface RunOutcome {
  code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/**
 * Spawn the compiled executable with piped stdin and a hard wall-clock kill.
 * The child is a separate process - user code never runs inside Next.js.
 */
function runWithStdin(
  exePath: string,
  stdin: string,
  wallMs: number,
  cwd: string
): Promise<RunOutcome> {
  return new Promise((resolve) => {
    const child = spawn(exePath, [], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let truncated = false;
    let timedOut = false;
    let settled = false;

    const finish = (code: number | null, signal: string | null) => {
      if (settled) return;
      settled = true;
      if (truncated) {
        stderr += '\n[output truncated at 5MB]';
      }
      resolve({ code, signal, stdout, stderr, timedOut });
    };

    const collect = (chunk: Buffer, out: 'stdout' | 'stderr') => {
      const text = chunk.toString('utf8');
      if (out === 'stdout') {
        const free = MAX_OUTPUT_BYTES - Buffer.byteLength(stdout);
        if (free <= 0) {
          truncated = true;
          return;
        }
        stdout += text.length > free ? text.slice(0, free) : text;
        truncated = truncated || text.length > free;
      } else {
        const free = MAX_OUTPUT_BYTES - Buffer.byteLength(stderr);
        if (free <= 0) {
          truncated = true;
          return;
        }
        stderr += text.length > free ? text.slice(0, free) : text;
        truncated = truncated || text.length > free;
      }
    };

    child.stdout.on('data', (chunk: Buffer) => collect(chunk, 'stdout'));
    child.stderr.on('data', (chunk: Buffer) => collect(chunk, 'stderr'));
    // Program may exit without reading stdin (EPIPE); ignore the write error.
    child.stdin.on('error', () => {});
    child.stdin.end(stdin);

    child.on('error', (err) => {
      clearTimeout(timer);
      stderr = stderr || err.message;
      finish(null, null);
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      finish(code, signal);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill();
      } catch {
        // Already exited between the timeout and the kill - close will settle.
      }
    }, wallMs);
  });
}

/**
 * Local judge-lite runner. Compiles with the machine's gcc (MinGW-w64 on
 * Windows) into a private mkdtemp dir and executes the binary as a spawned
 * child with a 5s wall-clock kill. valgrind is not available locally.
 */
export class LocalJudgeProvider implements JudgeProvider {
  readonly name = 'judge-local';

  async run(req: JudgeRunRequest): Promise<JudgeResult> {
    const startedAt = Date.now();
    const gccBin = resolveGccBinary();

    if (!probeGcc()) {
      // Infra failure, NOT a compile error: throw so callers surface
      // judge_unavailable (escalated / 500) instead of a fake CE verdict.
      throw new Error(`JUDGE_INFRA: ${GCC_MISSING_STDERR}（tried: ${gccBin}）`);
    }

    const dir = await mkdtemp(join(tmpdir(), 'judge-local-'));
    const exeName = process.platform === 'win32' ? 'main.exe' : 'main';
    const exePath = join(dir, exeName);

    try {
      await writeFile(join(dir, 'main.c'), req.source, 'utf8');

      // Step 1: compile. Non-zero exit = CE.
      let compileWarnings = '';
      try {
        const compile = await execFileAsync(
          gccBin,
          ['-std=c11', '-Wall', '-Wextra', '-O2', 'main.c', '-o', exeName],
          {
            cwd: dir,
            timeout: COMPILE_TIMEOUT_MS,
            maxBuffer: MAX_OUTPUT_BYTES,
            windowsHide: true,
          }
        );
        compileWarnings = (compile.stdout + compile.stderr).trim();
      } catch (err) {
        const e = err as { stderr?: string; stdout?: string; message: string };
        return {
          status: 'CE',
          stdout: '',
          stderr: (e.stderr ?? '') || (e.stdout ?? '') || e.message,
          timeMs: Date.now() - startedAt,
          memoryKb: 0,
        };
      }

      // Step 2: run with piped stdin and the wall-clock limit.
      const wallMs = req.limits?.timeoutMs ?? DEFAULT_WALL_MS;
      const { code, signal, stdout, stderr, timedOut } = await runWithStdin(
        exePath,
        req.stdin ?? '',
        wallMs,
        dir
      );

      const timeMs = Date.now() - startedAt;
      let finalStderr = stderr;
      if (compileWarnings && !finalStderr.startsWith(compileWarnings)) {
        finalStderr = compileWarnings + '\n' + finalStderr;
      }

      if (timedOut) {
        return {
          status: 'TLE',
          stdout,
          stderr: finalStderr || `timed out after ${Math.round(wallMs / 1000)}s`,
          timeMs,
          memoryKb: 0,
        };
      }
      if (signal) {
        return { status: 'RE', stdout, stderr: finalStderr, signal, timeMs, memoryKb: 0 };
      }
      if (code === 0) {
        return { status: 'AC', stdout, stderr: finalStderr, timeMs, memoryKb: 0 };
      }
      // Crash reported as an NTSTATUS exit code (Windows) -> RE + signal.
      const crashSignal = code !== null ? crashSignalFromCode(code) : undefined;
      if (crashSignal) {
        return {
          status: 'RE',
          stdout,
          stderr: finalStderr,
          signal: crashSignal,
          timeMs,
          memoryKb: 0,
        };
      }
      // Non-zero exit or failed spawn -> RE.
      return { status: 'RE', stdout, stderr: finalStderr, timeMs, memoryKb: 0 };
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
