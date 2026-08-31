/**
 * Functional smoke test for POST /api/judge/run hardening (task 10).
 *
 * Run against a running dev server, e.g.:
 *   node scripts/judge-route-smoke.mjs http://localhost:3159
 *
 * T1 rate limit: 10 OK then 429 with Retry-After (default IP bucket).
 * T2 concurrency: 4 concurrent 2s jobs -> 3 run immediately, 4th queues (~4s).
 * T3 output cap: >1MB stdout comes back truncated at 1MB with a marker.
 * T4 sanity: plain AC program still judges correctly.
 */

const base = process.argv[2] ?? 'http://localhost:3159';
const url = `${base}/api/judge/run`;

const AC_CODE =
  '#include <stdio.h>\nint main(void){int a,b; if(scanf("%d %d",&a,&b)!=2) return 0; printf("%d\\n",a+b); return 0;}';
const SLOW_CODE =
  '#include <stdio.h>\n#include <windows.h>\nint main(void){Sleep(2000); printf("done\\n"); return 0;}';
const BIG_CODE = [
  '#include <stdio.h>',
  "int main(void){int i; for(i=0;i<1500000;i++) putchar('x'); return 0;}",
].join('\n');

let failures = 0;
function ok(cond, label) {
  if (cond) console.log(`ok - ${label}`);
  else {
    console.error(`FAIL: ${label}`);
    failures += 1;
  }
}

async function post(body, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json, retryAfter: res.headers.get('retry-after') };
}

async function t1RateLimit() {
  let last = null;
  let okCount = 0;
  for (let i = 0; i < 12; i++) {
    last = await post({ language: 'c', source: AC_CODE, stdin: '3 4' });
    if (last.status === 200 && last.json?.status === 'AC') okCount++;
  }
  ok(okCount === 10, `T1 first 10 requests judged (got ${okCount})`);
  ok(last.status === 429, `T1 11th request -> 429 (got ${last.status})`);
  ok(last.json?.error === 'RATE_LIMITED', 'T1 429 body error=RATE_LIMITED');
  ok(
    Number(last.retryAfter) >= 1 && Number(last.retryAfter) <= 60,
    `T1 Retry-After=${last.retryAfter}`
  );
}

async function t2Concurrency() {
  // Different XFF IP to avoid the rate bucket T1 exhausted.
  const start = Date.now();
  const runs = await Promise.all(
    [1, 2, 3, 4].map(async () => {
      const t0 = Date.now();
      const r = await post({ language: 'c', source: SLOW_CODE }, { 'x-forwarded-for': '10.9.9.9' });
      return { ms: Date.now() - t0, status: r.status };
    })
  );
  const total = Date.now() - start;
  const durations = runs.map((r) => r.ms).sort((a, b) => a - b);
  ok(
    runs.every((r) => r.status === 200),
    'T2 all 4 concurrent requests accepted (queued, not rejected)'
  );
  ok(durations[0] >= 1500, `T2 first-wave jobs each ~2s (min=${durations[0]}ms)`);
  ok(durations[3] >= 3500, `T2 4th job waited in queue ~4s (max=${durations[3]}ms)`);
  ok(total < 7000, `T2 total wall ${total}ms < 7s proves limit-3 queue, not serial 8s`);
}

async function t3OutputCap() {
  const r = await post({ language: 'c', source: BIG_CODE }, { 'x-forwarded-for': '10.9.9.8' });
  ok(r.status === 200, `T3 big-output request judged (${r.status})`);
  const stdout = r.json?.stdout ?? '';
  ok(stdout.includes('[output truncated at 1MB]'), 'T3 truncation marker present');
  ok(stdout.length <= 1024 * 1024 + 64, `T3 stdout capped near 1MB (${stdout.length} chars)`);
}

async function t4Sanity() {
  const r = await post(
    { language: 'c', source: AC_CODE, stdin: '20 22' },
    { 'x-forwarded-for': '10.9.9.7' }
  );
  ok(
    r.status === 200 && r.json?.status === 'AC' && r.json?.stdout.trim() === '42',
    'T4 AC sanity 20+22=42'
  );
}

async function main() {
  console.log(`target: ${url}`);
  await t1RateLimit();
  await t2Concurrency();
  await t3OutputCap();
  await t4Sanity();
  console.log(failures ? `ROUTE SMOKE FAILED (${failures})` : 'ROUTE SMOKE OK');
  process.exitCode = failures ? 1 : 0;
}

main().catch((err) => {
  console.error('route smoke crashed:', err);
  process.exitCode = 1;
});
