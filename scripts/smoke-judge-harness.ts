/**
 * Smoke test for src/lib/judge/harness.ts (runHiddenTests).
 *
 * Why the flags: harness -> getJudgeProvider -> 'server-only' throws when
 * resolved under plain Node (its default export condition). Running with
 * `--conditions react-server` makes 'server-only' resolve to its empty
 * react-server entry, so the script works outside Next.js.
 *
 * Run: node --conditions react-server --import tsx scripts/smoke-judge-harness.ts
 */

import type { JudgeProvider, JudgeResult, JudgeRunRequest } from '../src/lib/providers/judge/types';

const BIG = 1024 * 1024 + 100;

/** Deterministic fake judge: behaviour is keyed on the stdin string. */
class MockProvider implements JudgeProvider {
  readonly name = 'judge-mock-smoke';

  async run(req: JudgeRunRequest): Promise<JudgeResult> {
    const stdin = req.stdin ?? '';
    if (stdin === 'CE') {
      return {
        status: 'CE',
        stdout: '',
        stderr: "main.c:3:1: error: expected ';' before '}' token",
        timeMs: 1,
        memoryKb: 0,
      };
    }
    if (stdin === 'crash') {
      return {
        status: 'RE',
        stdout: '',
        stderr: 'boom',
        signal: 'SIGSEGV',
        timeMs: 1,
        memoryKb: 0,
      };
    }
    if (stdin === 'slow') {
      return { status: 'TLE', stdout: '', stderr: 'timed out after 5s', timeMs: 5001, memoryKb: 0 };
    }
    if (stdin === 'big') {
      return { status: 'AC', stdout: 'x'.repeat(BIG), stderr: '', timeMs: 1, memoryKb: 0 };
    }
    return { status: 'AC', stdout: `echo:${stdin}\n`, stderr: '', timeMs: 1, memoryKb: 0 };
  }
}

function assert(cond: boolean, label: string): void {
  if (!cond) {
    console.error(`FAIL: ${label}`);
    process.exitCode = 1;
  } else {
    console.log(`ok - ${label}`);
  }
}

async function main(): Promise<void> {
  // env.ts (imported via the harness -> factory chain) parses at import time.
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/smoke?schema=public';
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'smoke-test-secret-0123456789abcdef';

  const { runHiddenTests, MAX_OUTPUT_BYTES } = await import('../src/lib/judge/harness');
  const mock = new MockProvider();

  // T1: all cases pass.
  const ok = await runHiddenTests(
    'int main(){return 0;}',
    [
      { stdin: 'a', expected: 'echo:a', description: '普通输入' },
      { stdin: 'b', expected: 'echo:b', description: '普通输入' },
    ],
    { provider: mock }
  );
  assert(ok.allPassed === true, 'T1 allPassed');
  assert(ok.results.length === 2 && ok.results.every((r) => r.passed), 'T1 two passed results');
  assert(ok.firstFailure === undefined, 'T1 no firstFailure');

  // T2: first WA returns nature hint WITHOUT the expected value, stops early.
  const wa = await runHiddenTests(
    'int main(){return 0;}',
    [
      { stdin: 'a', expected: 'echo:a', description: '普通输入' },
      { stdin: 'b', expected: 'SECRET-ANSWER-b', description: 'n=0 的边界' },
      { stdin: 'c', expected: 'echo:c', description: '大输入' },
    ],
    { provider: mock }
  );
  assert(wa.allPassed === false, 'T2 allPassed=false');
  assert(wa.results.length === 2, 'T2 stops at first WA (2 results, 3rd never ran)');
  assert(wa.results[1].actual === 'echo:b', 'T2 student output exposed as actual');
  assert(wa.results[1].expectedHidden === true, 'T2 expectedHidden=true');
  assert(wa.firstFailure?.testId === 'case-2', 'T2 firstFailure is case-2');
  assert(wa.firstFailure?.description === 'n=0 的边界', 'T2 description preserved');
  const hint = wa.firstFailure?.hint ?? '';
  assert(hint.includes('n=0 的边界'), 'T2 hint carries nature label');
  assert(hint.includes('输出与期望不符'), 'T2 hint describes the mistake kind');
  assert(!hint.includes('SECRET-ANSWER-b'), 'T2 hint does NOT leak the expected value');
  assert(JSON.stringify(wa).includes('SECRET-ANSWER-b') === false, 'T2 whole report leaks nothing');

  // T3: CE short-circuits (compile once) with compiler-diagnostic hint.
  const ce = await runHiddenTests(
    'int main(){',
    [
      { stdin: 'CE', expected: 'x', description: '任意' },
      { stdin: 'y', expected: 'z', description: '第二组' },
    ],
    { provider: mock }
  );
  assert(ce.allPassed === false, 'T3 allPassed=false');
  assert(
    ce.results.length === 1 && ce.results[0].verdict === 'CE',
    'T3 single CE result, case 2 skipped'
  );
  assert((ce.firstFailure?.hint ?? '').includes('无法通过编译'), 'T3 CE nature hint');

  // T4: RE / TLE produce nature hints, not raw output.
  const re = await runHiddenTests('x', [{ stdin: 'crash', expected: 'y' }], { provider: mock });
  assert((re.firstFailure?.hint ?? '').includes('SIGSEGV'), 'T4 RE hint mentions signal');
  assert((re.firstFailure?.hint ?? '').includes('数组越界'), 'T4 RE hint mentions likely cause');
  const tle = await runHiddenTests('x', [{ stdin: 'slow', expected: 'y' }], { provider: mock });
  assert((tle.firstFailure?.hint ?? '').includes('死循环'), 'T4 TLE hint mentions infinite loop');

  // T5: huge stdout is capped at 1MB with a marker.
  const big = await runHiddenTests('x', [{ stdin: 'big', expected: 'whatever' }], {
    provider: mock,
  });
  const actual = big.results[0].actual;
  assert(actual.length <= MAX_OUTPUT_BYTES + 64, 'T5 actual capped near 1MB');
  assert(actual.includes('[output truncated at 1MB]'), 'T5 truncation marker present');

  // T6: real gcc batch (skipped gracefully when gcc is absent).
  const { LocalJudgeProvider } = await import('../src/lib/providers/judge/local');
  const cCode = [
    '#include <stdio.h>',
    'int main(void){ long long n; if(scanf("%lld",&n)!=1) return 0;',
    '  printf("%s\\n", n%2==0 ? "even" : "odd"); return 0; }',
  ].join('\n');
  const real = await runHiddenTests(
    cCode,
    [
      { stdin: '4', expected: 'even', description: '正偶数' },
      { stdin: '7', expected: 'odd', description: '正奇数' },
      { stdin: '0', expected: 'even', description: 'n=0 的边界' },
      { stdin: '3', expected: 'even', description: '奇偶判断' }, // wrong on purpose
    ],
    { provider: new LocalJudgeProvider() }
  );
  if (real.results[0]?.verdict === 'CE' && (real.firstFailure?.hint ?? '').includes('gcc')) {
    console.log('skip - gcc not available, real-provider batch untested');
  } else {
    assert(real.allPassed === false, 'T6 real gcc batch fails at case-4');
    assert(real.results.length === 4, 'T6 real gcc ran 4 cases');
    assert(real.firstFailure?.testId === 'case-4', 'T6 firstFailure is case-4');
    const rh = real.firstFailure?.hint ?? '';
    assert(rh.includes('奇偶判断'), 'T6 real hint carries nature label');
    assert(!rh.includes('even') && !rh.includes('odd'), 'T6 real hint leaks no expected value');
    assert(real.results[3].actual === 'odd', 'T6 student output exposed (actual=odd)');
  }

  console.log(process.exitCode ? 'SMOKE FAILED' : 'SMOKE OK');
}

main().catch((err) => {
  console.error('smoke crashed:', err);
  process.exitCode = 1;
});
