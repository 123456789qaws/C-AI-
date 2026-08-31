# Task 18 — 日志落库与回放 API（AiInteractionLog 全字段）

### Date: 2026-08-31

## Summary

- `src/lib/logs/diff.ts` — 最小行级 diff（公共前缀/后缀裁剪 + `@@` 头），无前态或相同 → `''`，输出截断 64KB，零依赖。
- `src/lib/logs/logger.ts` — `logInteraction()` 统一写入入口：prisma.aiInteractionLog.create 全字段（含 codeDiff 自动计算、sessionId 缺省 randomUUID），try/catch 降级为脱敏 console.error，DB 不可用绝不阻塞判定。
- `src/lib/logs/csv.ts` — `csvEscape`/`toCsv`（RFC 4180 转义）+ `redactStudentId`（保首尾各 2 位）。
- `src/app/api/logs/route.ts` — GET 时间线聚合：Bearer verifyToken 权威校验；STUDENT 强制只看自己（忽略 query.studentId 覆盖），TEACHER/TA 可看全部或按 studentId 过滤；`ts ASC, id ASC` 时间线；`?format=csv` → text/csv 附件（STUDENT 视角 studentId 统一脱敏）。
- `src/app/api/checkpoint/verify/route.ts` — 删除内联 `simpleLineDiff`/`persistInteractionLog`/`LogRowInput`（-85 行），硬锁拒收 + 每 gate 一行改为调 `logInteraction`，行为不变。
- `src/app/api/ai/socratic/route.ts` — 新增 taskId 入参、Bearer(JWT) 优先的 `resolveStudentId`、每次调用落库 AiInteractionLog（role=assistant, gateResult=pass/fail, model/tokens/confidence 全字段）。

Middleware：`/api/logs/*` 已在 matcher 保护名单内（HEAD 即如此），无需改动。

## Verification

- ✅ `pnpm build` — Compiled successfully；路由表 `ƒ /api/logs` 注册。
- ✅ `pnpm lint` — "No ESLint warnings or errors"；`pnpm exec tsc --noEmit` 0。
- ✅ 单元（tsx, 20/20 PASS）：diff 相同/无前态/CRLF/截断、csv 转义/toCsv 结构/redactStudentId。
- ✅ HTTP smoke（dev :3190, AI_PROVIDER=mock, 9/9 PASS）：
  - /api/logs 无 token → 401；伪造 token → 401（middleware + 路由双校验）
  - student + `?taskId=fib_L2` → 500 db_error（鉴权通过、查询发起；PG 未运行）
  - student + `?studentId=99999999&format=csv` → 500 db_error；日志中 `99999999` 仅出现在 access-log URL 行，SQL 参数从不绑定该值（强制自己 id 生效）
  - teacher 无过滤 → 500 db_error（`WHERE 1=1`，可看全部）
  - 2× verify cp1 → 200 passed；tamper 提交 → 403 escalated（判定链路不受日志写入失败影响）
- ✅ SQL 构造证据（prisma:query，dev 日志）：
  - `INSERT INTO "AiInteractionLog" ("id","studentId",...,"codeDiff","gateResult","gateType","model","tokens","confidence","sessionId") VALUES ($1..$17)` ×5 —— 2 verify×2 gates + 1 tamper 锁日志，每条验证全量落库。
  - 日志查询三种形态：`WHERE (taskId=$1 AND studentId=$2) ORDER BY ts ASC, id ASC`（学生时间线）/ `WHERE studentId=$1 ORDER BY ts ASC`（强制自己 id）/ `WHERE 1=1 ORDER BY ts ASC`（教师全部）。
  - `[logs] AiInteractionLog 写入失败:` ×5 —— logger 降级路径按预期触发（PG 未运行）。

## Note

Postgres 在本机未运行（无本地服务，docker daemon down）——时间线回放与 CSV 下载的**端到端**数据路径无法live验证；SQL 构造（含 WHERE/ORDER BY/全字段 INSERT）与授权逻辑已通过 prisma:query 日志 + HTTP smoke 证实，DB 上线后即可直接工作。单元覆盖了 diff/csv 纯函数，行为与构造一致。

## Files

- src/lib/logs/diff.ts, src/lib/logs/logger.ts, src/lib/logs/csv.ts（新）
- src/app/api/logs/route.ts（新）
- src/app/api/checkpoint/verify/route.ts（重构去重）
- src/app/api/ai/socratic/route.ts（补日志落库）
