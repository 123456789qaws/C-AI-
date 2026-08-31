# Task 16: Socratic 追问与 valgrind 线索注入

## Date: 2026-08-31

## Summary

Implemented the Socratic follow-up & valgrind hint injection layer on the AI socratic gateway:

- **src/lib/ai/context.ts (new)** — pure functions:
  - `buildSocraticContext({studentAnswer, codeSnippet, judgeResult?, checkpointMeta?, valgrindHint?, aiFollowup?})` — assembles the user message; when `judgeResult.status === 'RE'` AND (`checkpointMeta.memoryTask` OR `valgrindHint` OR valgrind output present), prepends a sanitized `【判题线索】` block with a 1-2 line crash summary and instructs the model to first ask 「你打印过这个指针的地址吗？…在哪一行变成了 NULL / 越界？」; explicitly forbids raw stack backtraces and full fix code.
  - `extractValgrindSummary(valgrindOutput)` — extracts ≤2-part summary: `Invalid read/write of size N（访问地址为 NULL，空指针）；崩溃点：main (file.c:line)`. Returns '' when nothing recognizable.
- **src/lib/ai/prompt.ts** — `buildJudgePrompt(userMsg, codeSnippet?, aiFollowup?)`: appends `追加追问：{aiFollowup}` when present.
- **src/lib/ai/guard.ts** — `enforceSocraticHardRule(reply)` + `SOCRATIC_HARD_RULE_REPLACEMENT`: gateway-side hard-rule enforcement. Any fenced code block with >5 non-empty lines, or >5 lines containing '{' → whole reply replaced with `我不能给出完整实现，请先思考：…` (a question, no code).
- **src/app/api/ai/socratic/route.ts** — accepts optional body fields `{valgrindHint?, aiFollowup?, judgeResult?: {status, stderr, valgrind?}, checkpointMeta?: {title?, memoryTask?}}`; sanitizes/truncates each (raw valgrind capped 20000 chars, never passed to the model — only its summary); passes all into `buildSocraticContext`; applies `enforceSocraticHardRule` to the parsed reply before responding.

## Verification

### Build & lint

```
$ pnpm build
✓ Compiled successfully
✓ Generating static pages (12/12)
Route table: ƒ /api/ai/socratic (dynamic)

$ pnpm lint
✔ No ESLint warnings or errors

$ pnpm exec tsc --noEmit   # exit 0
```

### Unit-ish check (tsx, 21 assertions — ALL PASSED)

Run: `pnpm exec tsx C:\Users\Lenovo\AppData\Local\Temp\opencode\task16-check.ts`

```
valgrind summary -> "Invalid write of size 4（访问地址为 NULL，空指针）；崩溃点：main (test.c:6)"
PASS  summary mentions Invalid write of size 4
PASS  summary mentions crash point test.c:6
PASS  summary mentions NULL (空指针)
PASS  summary <= 2 parts
PASS  summary does NOT leak raw valgrind lines
PASS  empty input -> empty string
PASS  no recognizable content -> empty string
PASS  context injects 判题线索 block
PASS  context instructs asking pointer address
PASS  context asks where became NULL
PASS  context includes student code
PASS  context includes student answer
PASS  context does NOT leak raw stack/valgrind
PASS  RE + valgrindHint (no valgrind output) injects generic hint
PASS  WA + memoryTask does NOT inject crash hint
PASS  RE alone (no memory/valgrind) does NOT inject hint
PASS  aiFollowup appended as 追加追问
PASS  6-line code block replaced with Socratic question
PASS  <=5-line code block kept
PASS  >5 brace-lines replaced
PASS  normal socratic reply kept
PASS  replacement is a question without code

ALL CHECKS PASSED
```

### Functional HTTP test (dev server PORT=3163, real deepseek provider)

T1 — segfault failure + valgrind + memoryTask + aiFollowup → 200, reply is Socratic pointer-address question, no fix code:

```json
{"pass":false,"confidence":0.3,"reply":"你打印过 p 的地址吗？它当前是 NULL，那这行赋值操作试图往哪个地址写？","reason":"学生未展示理解空指针解引用问题，需引导其观察指针地址与状态","provider":"deepseek-api","remaining":4}
```

(second identical case: `"你打印过 p 的地址吗？地址是多少？它在哪一行变成了 NULL？"` — contains 打印地址 + 哪一行 NULL ✓)

T2 — aiFollowup propagation (no judgeResult): followup `这块内存谁负责释放？` → model asked exactly that:

```json
{"reply":"你提到分配了内存，但我想知道——这块内存是谁负责释放的呢？如果忘了释放，会发生什么？",...}
```

### MUST-NOT-DO checks

- ✅ Raw valgrind output / stack backtrace never reaches the model (only `extractValgrindSummary`'s 1-2 line digest; verified in unit check `context does NOT leak raw stack/valgrind`)
- ✅ Model reply with >5-line code block is replaced at the gateway by `enforceSocraticHardRule`
- ✅ `pnpm build` + `pnpm lint` pass

## Gotchas

1. **Valgrind line format keeps `==pid==` prefix** — regexes must tolerate the optional `==\d+== ` prefix when locating `Invalid read/write` / `at 0x…` / `Address 0x0 is not stack'd` lines (substring matches are prefix-agnostic; only error-line stripping removes the prefix).
2. **PowerShell console GBK mojibake** — `Invoke-WebRequest .Content` shows mojibake for UTF-8 JSON in a GBK console; decode with `[Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray())` (and set `[Console]::OutputEncoding = UTF8`) to capture clean evidence.
3. **Keep context.ts dependency-light** — imports only `./prompt` (no judge/server-only imports), so a standalone `tsx` check compiles/runs without Next.js; judge result shape re-declared locally (`JudgeFailureContext`) to stay decoupled from the judge contract.
4. **The real deepseek provider IS configured in .env** — circuit-breaker tests from Task 15 (expecting 502→mock) no longer apply; real replies arrive on first call. Rate-limit tests must use fresh `studentId`/`checkpointId` pairs (5/h per bucket).

## Files Created/Modified

- src/lib/ai/context.ts (new)
- src/lib/ai/prompt.ts (buildJudgePrompt + aiFollowup param)
- src/lib/ai/guard.ts (enforceSocraticHardRule + SOCRATIC_HARD_RULE_REPLACEMENT)
- src/app/api/ai/socratic/route.ts (new optional body fields + context assembly + reply guard)

## Next Steps

- Task 18: wire `on_fail.ai_followup` / `valgrind_hint` from the checkpoint config (memory_task) into the chat client so the frontend sends these fields automatically
- Task 17: JWT identity → persist AiInteractionLog / CheckpointProgress
