# Evidence: Task 21 — AGENTS.md（AI 代理守则，<150 行）

## Date
2026-09-01

## Task
Write/extend AGENTS.md at repo root with AI coding-agent guardrails: project rules, hard-lock double-check, full-field logging, sandbox/security, stack boundaries, workflow. Must NOT exceed ~150 lines, must preserve existing 注意事项 section at top.

## Changes
- `AGENTS.md`: 5 user 注意事项 rules preserved verbatim (lines 1-6), then 6 technical sections appended:
  1. 项目规则 — C11 flags, TS strict, Socratic NEVER >5 行, 指针三问, JSON-only judge output, escalate
  2. 硬门控 — Monaco deltaDecorations + onBeforeChange (UX) AND backend /api/checkpoint/verify + /api/submit double-check → 403
  3. 日志 — logInteraction() single path, AiInteractionLog 全字段, DB-down degrade
  4. 沙箱与安全 — docker `--rm --network=none --memory=256m --pids-limit=64 --read-only --tmpfs /tmp`, never eval in-process, server-only, sanitizePrompt, 限流/熔断
  5. 目录与边界 — allowed/forbidden dirs, JUDGE_MODE / AI_PROVIDER env hot-swap, tasks/*.json 真源, route-only-exports
  6. 工作流 — feat/* 分支, tasks/seed/hidden_tests 同步, valgrind, commit+lint+build+test 绿
- `.omo/notepads/luna-for-c-mvp-scaffold/learnings.md`: appended Task 21 learning entry.

## Verification
- `(Get-Content AGENTS.md).Count` → **48 lines** (< 150 cap) ✅
- Required hard rules found via grep ✅:
  - Line 11: `NEVER output >5 行完整函数`
  - Line 18: `deltaDecorations` + backend double-check lines 19-20
  - Line 29: `--network=none`
  - Line 32: `server-only` guard, `import 'server-only'` 首行
  - Line 39: `JUDGE_MODE=auto|docker|local`, `AI_PROVIDER=deepseek-api|qwen-local|mock` (Provider 热插拔 env)
  - Line 44: `feat/*` branch workflow
  - Line 1: `## 注意事项` preserved at top
- No prose; all bullet/checklist style.
- User 注意事项 5 rules byte-identical (append-only edit).

## Files
- AGENTS.md (modified)
- .omo/notepads/luna-for-c-mvp-scaffold/learnings.md (appended Task 21)
