# Task 11: Checkpoint Gate DSL 与 Zod 校验（tasks 真源）

- Date: 2026-08-31
- Status: ✅ complete

## Files Created

| File | Purpose |
| :--- | :--- |
| `src/lib/checkpoint/schema.ts` | Zod schema for the Gate DSL: `Task {id,title,description?,checkpoints[]}`, `Checkpoint {id,title,guide_question,gates[],pass_threshold,unlock{editorRegion,hints?},on_fail?{ai_followup?,valgrind_hint?}}`, discriminated-union `Gate` = `regex{rule,weight} \| ai_socratic{rubric,weight} \| test_pass{tests,weight}`. Exports `TaskSchema` + inferred types. |
| `src/lib/checkpoint/loader.ts` | `import 'server-only'` first line. `loadTask(taskId)` reads `tasks/<id>.json` via `node:fs/promises`, `TaskSchema.parse` (throws on invalid), taskId guard `/^[A-Za-z0-9_-]+$/` blocks path traversal; `listTasks()` loads all `*.json` sorted. |
| `tasks/fib_L2.json` | 斐波那契（递归）: cp1 regex(终止条件)+ai_socratic(rubric 递归终止) → cp2 test_pass `hidden_tests/fib_2.json`; unlock `[5,15]` / `[16,30]`; on_fail ai_followup / valgrind_hint. |
| `tasks/linked_list_reverse.json` | 单链表逆置: cp1 regex(暂存 next)+ai_socratic(指针所有权) → cp2 test_pass `hidden_tests/linked_list_3.json`; unlock `[12,25]` / `[26,50]`; on_fail. |
| `tasks/README.md` | Gate DSL field reference + how to add a task + hidden_tests placeholder note (todo 20). |

## Verification

### 1. pnpm build — ✅ exit 0
```
✓ Generating static pages (12/12)
├ ƒ /api/judge/run  0 B
└ ○ /dashboard  4.53 kB
```

### 2. pnpm lint — ✅ exit 0
```
✔ No ESLint warnings or errors
```

### 3. tsx smoke check (loader + schema) — ✅ 28/28 PASS
`node --conditions react-server --import tsx task11-check.ts` (temp dir script, run from project root):

```
PASS  fib_L2 loads with 2 checkpoints
PASS  fib_L2 title
PASS  fib cp1 gate types = regex + ai_socratic
PASS  fib cp1 regex rule matches seed
PASS  fib cp1 socratic rubric present
PASS  fib cp1 unlock editorRegion [5,15]
PASS  fib cp1 on_fail has ai_followup
PASS  fib cp2 is test_pass on hidden_tests/fib_2.json
PASS  fib cp2 unlock editorRegion [16,30]
PASS  fib cp2 on_fail valgrind_hint true
PASS  linked_list_reverse loads with 2 checkpoints
PASS  ll cp1 regex rule matches seed
PASS  ll cp1 unlock editorRegion [12,25]
PASS  ll cp1 on_fail ai_followup present
PASS  ll cp2 test_pass on hidden_tests/linked_list_3.json
PASS  ll cp2 unlock editorRegion [26,50]
PASS  ll cp2 on_fail valgrind_hint true
PASS  listTasks returns both tasks sorted
PASS  zod rejects unknown gate type
PASS  zod rejects gate weight > 1
PASS  zod rejects pass_threshold > 1
PASS  zod rejects empty gates array
PASS  zod rejects editorRegion end < start
PASS  zod rejects missing rule on regex gate
PASS  zod rejects test_pass without tests
PASS  loadTask rejects path traversal id
PASS  loadTask rejects absolute path id
PASS  loadTask throws on missing task
28 passed, 0 failed
```

## Key Decisions

1. **tasks JSON = 真源** — loader reads `tasks/*.json` at runtime (`process.cwd()/tasks`); prisma `Task.checkpoints` is only a seed-time mirror. Loader is read-only + `server-only`, so the frontend cannot import it and cannot modify task definitions.
2. **Discriminated union for gates** — `z.discriminatedUnion('type', ...)` so `regex` requires `rule`, `ai_socratic` requires `rubric`, `test_pass` requires `tests`; extra/wrong payload fields are rejected.
3. **`pass_threshold` required everywhere** — seed.ts `FIB_L2_CHECKPOINTS[1]`/`LINKED_LIST_CHECKPOINTS[1]` (cp2) omit it; the standalone JSON adds `pass_threshold: 1.0` (single test_pass gate must fully pass). Deviation from seed noted — seed.ts should later import from tasks JSON or stay in sync manually.
4. **TaskId guard in loader** — `/^[A-Za-z0-9_-]+$/` before building the file path; schema also enforces the same pattern on `Task.id`, double layer against path traversal.
5. **`unlock.hints` optional** — doc 8.1 / seed include `hints`, task spec only names `editorRegion`; schema keeps `hints?` so seed-compatible content validates.
6. **schema.ts stays client-importable** — only `loader.ts` carries `server-only` (matches judge/ai provider pattern: pure types client-safe, factory guarded).

## Gotchas

1. **seed.ts cp2 lacks `pass_threshold`** — first smoke run failed with `expected number, received undefined`. Since the schema requires it, the JSON files carry it (`1.0`); doc + README note the seed↔JSON sync point.
2. **tsx top-level await in temp dir** — temp scripts outside the project have no `type: module` → esbuild CJS transform rejects top-level await; wrap in `async function main()`.
3. **async expectThrow must be awaited, and `process.exit` kills in-flight fs promises** — un-awaited `expectThrow(loadTask(...))` calls were silently terminated by the final `process.exit(0)` (fs I/O slower than sync zod microtasks), producing a phantom 25/28. `await` every async assertion before exiting.
4. **`server-only` under plain node throws** — smoke ran with `--conditions react-server` (task 10 gotcha reused); loader imports only schema.ts so no env vars needed.

## Next Steps

- Task 12: implement gate verify/evaluate logic (regex match, socratic call, `runHiddenTests`) + `/api/checkpoint/verify`; wire `pass_threshold` weighted scoring.
- Todo 20: create `hidden_tests/fib_2.json` + `hidden_tests/linked_list_3.json` (already referenced by the DSL).
- Consider making `prisma/seed.ts` import the tasks JSON so DB mirrors the true source automatically.
