/**
 * Judge provider contract - shared between the API route and judge implementations.
 *
 * Pure types only: safe to import from client code for rendering verdicts,
 * while the concrete providers live behind the server-only factory in ./index.ts.
 */

/** Verdict of a judged submission. */
export type Verdict = 'AC' | 'WA' | 'CE' | 'RE' | 'TLE';

/** Request to run (compile + execute) a single C submission. */
export interface JudgeRunRequest {
  language: 'c';
  source: string;
  stdin?: string;
  limits?: {
    /** CPU time limit in seconds. */
    cpuTime?: number;
    /** Memory limit in KB. */
    memory?: number;
    /** Wall-clock timeout in milliseconds. */
    timeoutMs?: number;
  };
}

/** Result of a judged submission. */
export interface JudgeResult {
  status: Verdict;
  stdout: string;
  stderr: string;
  /** Exit signal (e.g. 'SIGSEGV', 'SIGKILL') when the process died abnormally. */
  signal?: string;
  /** Wall-clock runtime in milliseconds. */
  timeMs: number;
  /** Peak memory usage in KB. */
  memoryKb: number;
  /** Valgrind output when memory checking was requested/enabled. */
  valgrind?: string;
}

/** A judge implementation. Implementations are selected by the factory in ./index.ts. */
export interface JudgeProvider {
  /** Stable identifier of this provider (e.g. 'judge-docker', 'judge-local'). */
  readonly name: string;
  run(req: JudgeRunRequest): Promise<JudgeResult>;
}
