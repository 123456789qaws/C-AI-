# Task 13 Evidence — 前端 Checkpoint 交互与解锁联动

Date: 2026-08-31
Checklist: `- [ ] 13. 前端 Checkpoint 交互与解锁联动`

## Scope

Wire `/api/checkpoint/verify` (todo 12) into the IDE page: 「请求验证」button,
guide_question display, AI reply bubbles, unlock animation (Monaco lockedRegions
update), Hand in gating (all pass required), frontend tamper rollback + toast,
no answer storage in frontend.

## Files Changed

| File | Change |
| :--- | :--- |
| `src/components/ide/CheckpointWorkspace.tsx` | NEW client component: verify wiring, checkpoint status map, guide question, unlock flash animation, toasts, Hand in |
| `src/app/(ide)/page.tsx` | Thin server wrapper rendering CheckpointWorkspace |
| `src/app/(ide)/layout.tsx` | Removed right-sidebar/toaster placeholders (workspace owns LunaPanel + toasts) |
| `src/components/editor/MonacoWorkspace.tsx` | + optional `onLockViolation` callback (rollback → toast) |
| `src/components/luna/LunaPanel.tsx` | Wired (props `{messages, onSend}` unchanged, rendered inside workspace) |
| `src/app/api/checkpoint/verify/route.ts` | Hard-lock allowed regions = union of checkpoints[0..currentIndex] (sequential-unlock fix) |
| `src/middleware.ts` | Anonymous POST verify allowed when body.studentId non-empty (demo channel) |
| `src/app/globals.css`, `tailwind.config.ts` | Defined previously-referenced shadcn tokens (primary/secondary/muted/card/border/input/ring/destructive/accent/radius-md) + unlock-pulse/toast-in keyframes |
| `hidden_tests/fib_2.json` | NEW minimal fib cases (6) so cp2 test_pass is passable end-to-end (todo 20 finalizes) |

## Build Log (pnpm lint + pnpm build)

```
$ pnpm lint
✔ No ESLint warnings or errors

$ pnpm build
  ▲ Next.js 14.2.35
  - Environments: .env
   Creating an optimized production build ...
 ✓ Compiled successfully
   Linting and checking validity of types ...
 ✓ Generating static pages (14/14)
Route (app)                              Size     First Load JS
┌ ○ /                                    13.2 kB         113 kB
├ ○ /_not-found                          872 B          88.2 kB
├ ƒ /api/ai/socratic                     0 B                0 B
├ ƒ /api/auth/login                      0 B                0 B
├ ƒ /api/auth/logout                     0 B                0 B
├ ƒ /api/auth/me                         0 B                0 B
├ ƒ /api/checkpoint/verify               0 B                0 B
├ ○ /api/health                          0 B                0 B
├ ƒ /api/judge/run                       0 B                0 B
├ ƒ /api/logs                            0 B                0 B
└ ○ /dashboard                           4.53 kB         104 kB
ƒ Middleware                             27 kB
```

## HTTP Smoke Tests (dev :3001, real DeepSeek AI + real gcc)

```
PASS  T1 cp1 verify passed  →  status=200 passed=true score=1 next=cp2 unlock=[[16,30]] escalated=false
PASS  T2 cp2 verify passed (real gcc + hidden tests)  →  status=200 passed=true score=1 escalated=false
PASS  T2b cp2 wrong impl -> failed with nature-only hint  →  hint=「基础递归：fib(2)」的输出与期望不符：请检查边界条件、特殊值处理和输出格式（换行/空格）
PASS  T3 tampered -> 403  →  status=403 violations=[3]
PASS  T4 no identity -> 401  →  status=401
5/5 passed
```

- T1: cp1 (regex + ai_socratic, chat answer) passes with template code + baseline; returns next=cp2.
- T2: **validates the sequential-unlock fix** — cp2 verify accepts the student's fib code in [5,15]
  (todo 12's single-region check would have 403'd it) and runs real gcc on hidden_tests/fib_2.json → AC.
- T2b: wrong implementation fails with a nature-only hint; expected values never leak.
- T3: locked-line edit (line 3) → 403 tampered + violations (backend hard lock, F12-proof).
- T4: missing identity → 401 (middleware anonymous channel only opens when studentId present).

Page smoke: `GET /` → HTTP 200, workspace markup present; prisma:error lines in dev log are
the documented DB-down degradation path (verdicts still returned, task 12).

## Security Notes

- Frontend stores ZERO answer material: inline task meta mirrors only public fields
  (id/title/guide_question/unlockRegion); regex rules, rubrics and hidden tests exist
  server-side only (server-only loader + judge).
- Frontend lock is UX-only; the route re-validates every submission (403 tamper path verified).
- Anonymous verify channel (middleware) is the documented MVP fallback; JWT (todo 17)
  will remove it and DEMO_STUDENT_ID.
