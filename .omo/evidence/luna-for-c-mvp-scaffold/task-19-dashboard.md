# Task 19: 教师大盘占位实现（热力与时间线）

## Date: 2026-09-01

## Summary
Successfully implemented the teacher dashboard with real data fetching from /api/logs, heatmap aggregation, 3-track timeline, override release, and CSV export:

- **src/app/(teacher)/dashboard/page.tsx** (rewired): Auth guard (STUDENT→无权限, UNAUTHENTICATED→请先登录), fetch /api/logs with bearer token, client-side heatmap aggregation (per taskId: submissions count, pass rate, escalated rate), 3-track timeline (codeDiff + AI dialogue + gateResult), per-row override button, CSV export via /api/logs?format=csv blob download. MOCK_* constants retained as DB-down fallback with "演示数据" badge.
- **src/app/api/checkpoint/override/route.ts** (new): POST endpoint, verifyToken role TEACHER/TA only (403 for student), body {studentId, taskId, checkpointId}, prisma.checkpointProgress.upsert passed=true unlockedAt=now, DB error → 500 db_error.

## Key Decisions
1. **Auth-first architecture**: On mount, dashboard calls /api/auth/me; STUDENT sees "无权限" lock screen; UNAUTHENTICATED sees "请先登录". No class data leaks to students.
2. **Client-side heatmap aggregation**: Heat data computed from raw /api/logs rows (groupBy taskId → count submissions/passed/failed/escalated → compute rates). Keeps server simple; sufficient for MVP scale.
3. **3-track timeline**: Each log entry displays up to 3 color-coded tracks: blue=代码变更 (codeDiff present), purple=AI对话 (promptText/aiReply present), green/orange/red=关卡判定 (gateResult). AI reply preview shown as 200-char line-clamp.
4. **Mock fallback**: When /api/logs returns empty or errors, MOCK_* constants display; "演示数据" badge visible in header. No crash, graceful degradation.
5. **CSV via server endpoint**: Button fetches /api/logs?format=csv with bearer → blob download (server handles CSV generation + student redaction). No client-side CSV generation for real data.
6. **Override route**: Upsert pattern creates or updates CheckpointProgress; attempts always increment; unlockedAt set to now. Module-private extractBearerToken (route export restriction from Task 8/14 gotcha).

## Verification Results
- ✅ pnpm build — Compiled successfully; `/dashboard` (6.8 kB), `ƒ /api/checkpoint/override` registered
- ✅ pnpm lint — "No ESLint warnings or errors"
- ✅ 15 static pages generated, 15 routes total
- ⚠️ DB not running locally — override route SQL construction code-path verified but untested live; heatmap aggregation from logs only works with live DB data (falls back to MOCK)

## Files Created/Modified
- `src/app/(teacher)/dashboard/page.tsx` — Complete rewrite with auth guard, data fetching, heatmap, timeline, CSV, override
- `src/app/api/checkpoint/override/route.ts` — New POST endpoint for teacher override
- `.omo/evidence/luna-for-c-mvp-scaffold/task-19-dashboard.md` — This file

## Gotchas
1. **Prettier formatting on large files** — The dashboard component with deeply nested JSX in .map() callbacks caused 80+ prettier errors. Running `pnpm exec prettier --write` on both files before build fixed all.
2. **PowerShell `&&` not supported** — Windows PowerShell 5.1 uses `;` not `&&` for command chaining. Use `workdir` parameter instead.
3. **MOCK_* as fallback, not removal** — Task spec explicitly requires mock data stays; DB-down environments (like this machine) still show a functional dashboard via mock constants.
