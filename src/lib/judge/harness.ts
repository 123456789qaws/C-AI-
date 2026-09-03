import 'server-only';

import { getJudgeProvider } from '@/lib/providers/judge';
import type { JudgeProvider, JudgeRunRequest, JudgeResult } from '@/lib/providers/judge/types';

/**
 * Hard cap for a single output stream (stdout / stderr / valgrind) surfaced to
 * callers: 1 MB. /api/judge/run applies the same cap before serializing.
 */
export const MAX_OUTPUT_BYTES = 1024 * 1024;

/** One hidden test case. `expected` is fed to the judge - never to the student. */
export interface HiddenTestCase {
  stdin?: string;
  expected: string;
  /**
   * NATURE label of the case (e.g. 'n=0 的边界', '大输入压力'), used to build
   * the failure hint. Deliberately describes the situation, not the answer.
   */
  description?: string;
  /**
   * Marks the case as memory-sensitive (pointer-heavy tasks like linked lists).
   * Currently informational; future runners may execute such cases under
   * valgrind to feed on_fail.valgrind_hint with real diagnostics.
   */
  valgrind?: boolean;
}

export type HiddenCaseStatus = 'passed' | 'failed' | 'skipped';

export interface HiddenCaseResult {
  testId: string;
  status: HiddenCaseStatus;
  passed: boolean;
  /** Student's output for this case (trimmed, capped at MAX_OUTPUT_BYTES). */
  actual: string;
  /** Verdict of this run (AC means the program ran; compare decided passed). */
  verdict: JudgeResult['status'];
  /**
   * Always true: hidden tests never expose `expected`. The field exists so a
   * serializer must consciously assert that nothing leaked, instead of the
   * absence of a field merely meaning "nobody added it yet".
   */
  expectedHidden: boolean;
}

export interface HiddenTestFailure {
  testId: string;
  /** NATURE label of the failing case (if the test provided one). */
  description?: string;
  /** NATURE description of the mistake - the kind of bug, never the answer. */
  hint: string;
}

export interface HiddenTestReport {
  allPassed: boolean;
  results: HiddenCaseResult[];
  firstFailure?: HiddenTestFailure;
}

function capOutput(text: string): string {
  if (Buffer.byteLength(text, 'utf8') <= MAX_OUTPUT_BYTES) return text;
  return text.slice(0, MAX_OUTPUT_BYTES) + '\n[output truncated at 1MB]';
}

/** CRLF -> LF + trim: MinGW stdio emits \r\n while expected files use \n. */
function normalize(text: string): string {
  return text.replace(/\r\n/g, '\n').trim();
}

/**
 * Build a NATURE hint from the verdict. The contract: describe the *kind* of
 * mistake (boundary condition, out-of-bounds access, infinite loop, ...) so the
 * student still has to find the fix themselves. Raw expected output is never
 * included for hidden tests.
 */
function hintFor(
  verdict: JudgeResult['status'],
  description: string | undefined,
  signal?: string
): string {
  switch (verdict) {
    case 'RE':
      return `运行时出错${signal ? `（${signal}）` : ''}：常见原因是数组越界、空指针或非法内存访问，请检查下标与指针的使用`;
    case 'TLE':
      return '运行超时：请检查是否存在死循环，或算法复杂度是否需要优化';
    case 'WA':
      return `「${description ?? '某组测试'}」的输出与期望不符：请检查边界条件、特殊值处理和输出格式（换行/空格）`;
    default:
      return '输出与期望不符：请检查边界条件与输出格式';
  }
}

/**
 * CE hint reuses the compiler's own diagnostics (that is not the answer).
 * Defensive: if an infra message ever leaks through as CE (custom provider),
 * translate it to an actionable Chinese hint instead of blaming the syntax.
 */
function ceHint(stderr: string): string {
  if (
    /unable to find image|no such image|docker daemon|JUDGE_INFRA|gcc not found|未找到 gcc/i.test(
      stderr
    )
  ) {
    return '判题机环境异常（docker 镜像缺失或本地无 gcc），非代码问题：请联系教师检查判题机，或稍后重试';
  }
  const firstLine = stderr.trim().split('\n')[0] ?? '';
  const detail = firstLine.length > 200 ? `${firstLine.slice(0, 200)}…` : firstLine;
  return detail
    ? `代码无法通过编译（${detail}）：请修正语法或类型错误`
    : '代码无法通过编译：请检查语法与类型错误';
}

/**
 * Run one C submission against a batch of hidden test cases.
 *
 * Each case is executed through the JudgeProvider (user code always runs out
 * of process - docker container or spawned binary). Comparison is trimmed
 * stdout vs trimmed expected. Stops at the FIRST failing case and returns a
 * NATURE description of the failure as `firstFailure.hint` - the expected
 * output is never exposed, only the kind of mistake.
 *
 * "Compile once" note: the provider compiles on every run() call by contract.
 * Since compilation is deterministic for a given source, the harness
 * short-circuits on the first CE instead of re-running gcc for every case.
 */
export async function runHiddenTests(
  code: string,
  tests: HiddenTestCase[],
  options?: {
    provider?: JudgeProvider;
    limits?: JudgeRunRequest['limits'];
  }
): Promise<HiddenTestReport> {
  const provider = options?.provider ?? getJudgeProvider();
  const baseReq: JudgeRunRequest = {
    language: 'c',
    source: code,
    limits: options?.limits,
  };

  const results: HiddenCaseResult[] = [];

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    const testId = `case-${i + 1}`;

    const result = await provider.run({ ...baseReq, stdin: test.stdin ?? '' });

    if (result.status === 'CE') {
      results.push({
        testId,
        status: 'failed',
        passed: false,
        actual: capOutput(result.stdout),
        verdict: 'CE',
        expectedHidden: true,
      });
      return {
        allPassed: false,
        results,
        firstFailure: { testId, description: test.description, hint: ceHint(result.stderr) },
      };
    }

    if (result.status !== 'AC') {
      results.push({
        testId,
        status: 'failed',
        passed: false,
        actual: capOutput(result.stdout),
        verdict: result.status,
        expectedHidden: true,
      });
      return {
        allPassed: false,
        results,
        firstFailure: {
          testId,
          description: test.description,
          hint: hintFor(result.status, test.description, result.signal),
        },
      };
    }

    const actual = normalize(result.stdout);
    const passed = actual === normalize(test.expected);
    results.push({
      testId,
      status: passed ? 'passed' : 'failed',
      passed,
      actual: capOutput(actual),
      verdict: 'AC',
      expectedHidden: true,
    });
    if (!passed) {
      return {
        allPassed: false,
        results,
        firstFailure: {
          testId,
          description: test.description,
          hint: hintFor('WA', test.description),
        },
      };
    }
  }

  return { allPassed: true, results };
}
