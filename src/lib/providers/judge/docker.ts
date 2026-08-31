import 'server-only';

import { execFile, execFileSync } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

import type { JudgeProvider, JudgeResult, JudgeRunRequest } from './types';

const execFileAsync = promisify(execFile);

const DOCKER_IMAGE = 'gcc:13';
const MEMORY_LIMIT = '256m';
const COMPILE_TIMEOUT_MS = 20_000;
const DEFAULT_WALL_MS = 5_000;
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024;

/**
 * Linux signal numbers -> names for the docker runner.
 * A process killed by signal N inside the container exits bash with 128+N.
 */
const SIGNAL_NAMES: Record<number, string> = {
  1: 'SIGHUP',
  2: 'SIGINT',
  3: 'SIGQUIT',
  4: 'SIGILL',
  5: 'SIGTRAP',
  6: 'SIGABRT',
  7: 'SIGBUS',
  8: 'SIGFPE',
  9: 'SIGKILL',
  10: 'SIGUSR1',
  11: 'SIGSEGV',
  12: 'SIGUSR2',
  13: 'SIGPIPE',
  14: 'SIGALRM',
  15: 'SIGTERM',
};

interface ExecError extends Error {
  code?: number | string;
  stdout?: string;
  stderr?: string;
}

/**
 * Cheap availability probe: `docker info` succeeds only when the CLI can reach
 * a running daemon. Used by the factory to pick docker vs local in auto mode.
 */
export function isDockerDaemonAvailable(timeoutMs = 5_000): boolean {
  try {
    execFileSync('docker', ['info', '--format', '{{.ServerVersion}}'], {
      timeout: timeoutMs,
      stdio: 'ignore',
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}

function toSeconds(ms: number): number {
  return Math.max(1, Math.ceil(ms / 1000));
}

/**
 * Shared prefix of every `docker run` invocation:
 * --network=none --memory=256m --pids-limit=64 --read-only --tmpfs /tmp
 * mounts the submission dir read-only at /code (program output is confined to
 * the /tmp tmpfs; the binary is compiled to /tmp/main so /code may stay ro).
 */
function dockerRunArgs(mountedDir: string): string[] {
  return [
    'run',
    '--rm',
    '--network=none',
    `--memory=${MEMORY_LIMIT}`,
    '--pids-limit=64',
    '--read-only',
    '--tmpfs',
    '/tmp',
    '-v',
    `${mountedDir}:/code:ro`,
    '-w',
    '/code',
    DOCKER_IMAGE,
    'bash',
    '-c',
  ];
}

/**
 * Docker judge-lite runner. User code NEVER executes in the Next.js process:
 * it is compiled and run exclusively inside an ephemeral gcc:13 container.
 */
export class DockerJudgeProvider implements JudgeProvider {
  readonly name = 'judge-docker';

  async run(req: JudgeRunRequest): Promise<JudgeResult> {
    const startedAt = Date.now();
    // Docker on Windows accepts C:/... mounts; forward slashes keep the CLI
    // from mangling backslashes inside the -v argument.
    const dir = await mkdtemp(join(tmpdir(), 'judge-docker-'));
    const mountedDir = dir.replace(/\\/g, '/');
    const wallMs = req.limits?.timeoutMs ?? DEFAULT_WALL_MS;

    try {
      await writeFile(join(dir, 'main.c'), req.source, 'utf8');
      await writeFile(join(dir, 'input.txt'), req.stdin ?? '', 'utf8');

      // Step 1: compile to /tmp/main (writable tmpfs). Non-zero exit = CE.
      const compileCmd = 'gcc -std=c11 -Wall -Wextra -O2 main.c -o /tmp/main';
      let compileWarnings = '';
      try {
        const compile = await execFileAsync('docker', [...dockerRunArgs(mountedDir), compileCmd], {
          timeout: COMPILE_TIMEOUT_MS,
          maxBuffer: MAX_OUTPUT_BYTES,
          windowsHide: true,
        });
        compileWarnings = (compile.stdout + compile.stderr).trim();
      } catch (err) {
        const e = err as ExecError;
        const detail = (e.stderr ?? '') || (e.stdout ?? '') || e.message;
        return {
          status: 'CE',
          stdout: '',
          stderr: detail,
          timeMs: Date.now() - startedAt,
          memoryKb: 0,
        };
      }

      // Step 2: run under `timeout` so infinite loops are killed at the limit.
      const runSeconds = toSeconds(wallMs);
      const runCmd = `timeout ${runSeconds}s /tmp/main < input.txt`;
      let stdout: string;
      let stderr: string;
      try {
        const run = await execFileAsync('docker', [...dockerRunArgs(mountedDir), runCmd], {
          timeout: wallMs + 10_000,
          maxBuffer: MAX_OUTPUT_BYTES,
          windowsHide: true,
        });
        stdout = run.stdout;
        stderr = run.stderr;
        if (compileWarnings) stderr = compileWarnings + '\n' + stderr;
        return {
          status: 'AC',
          stdout,
          stderr,
          timeMs: Date.now() - startedAt,
          memoryKb: 0,
        };
      } catch (err) {
        const e = err as ExecError;
        stdout = e.stdout ?? '';
        stderr = e.stderr ?? '';
        if (compileWarnings) stderr = compileWarnings + '\n' + stderr;
        const timeMs = Date.now() - startedAt;

        // GNU timeout exits 124 when it killed the child -> TLE.
        if (e.code === 124) {
          return {
            status: 'TLE',
            stdout,
            stderr: stderr || `timed out after ${runSeconds}s`,
            timeMs,
            memoryKb: 0,
          };
        }
        // bash exits 128+N when the last command died from signal N.
        if (typeof e.code === 'number' && e.code >= 128 && e.code < 256) {
          const sigNum = e.code - 128;
          return {
            status: 'RE',
            stdout,
            stderr,
            signal: SIGNAL_NAMES[sigNum] ?? `SIG${sigNum}`,
            timeMs,
            memoryKb: 0,
          };
        }
        // Any other non-zero exit (program `return n`) -> RE.
        if (typeof e.code === 'number' && e.code !== 0) {
          return { status: 'RE', stdout, stderr, timeMs, memoryKb: 0 };
        }
        // execFile failed without a child exit code (docker daemon down,
        // image pull failure, killed CLI...): surface as provider error so
        // the route answers 500 JUDGE_FAILED instead of faking a verdict.
        throw new Error(`docker run failed: ${e.message}`);
      }
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
