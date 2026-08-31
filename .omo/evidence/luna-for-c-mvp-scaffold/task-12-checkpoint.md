# Task 12: 后端硬锁与 /api/checkpoint/verify 三级漏斗

## Date: 2026-08-31

## What was built

`POST /api/checkpoint/verify` —— 前端灰显锁的服务端权威二次校验（绝不只信前端）：

1. **硬锁（漏斗第 0 级）**：提交 `code` 对比关卡 `unlock.editorRegion` 行号范围，
   锁定行（区间外）被写入内容 → `403 {passed:false, escalated:true, tampered:true}`，
   AiInteractionLog 记 `gateType=lock, gateResult=escalated`（教师大盘可标红）。
2. **正则初筛（第 1 级）**：`regex` gate 对「回答 OR 代码」做 RegExp 测试。
3. **AI 复核（第 2 级）**：`ai_socratic` gate 直连 AIProvider 按 rubric 判题，
   `confidence < 0.7` → `escalated`（不计入得分，转教师复核）。
4. **真判题（第 3 级）**：`test_pass` gate 读 `hidden_tests/*.json` →
   `runHiddenTests` 真 gcc 编译运行，全 AC 才过；只回传失败用例「性质描述」，
   expected 绝不外泄。

权重求和：`score = Σ(通过 gate 的 weight) / Σ(全部 weight)`，`passed = score >= pass_threshold`。
每次验证（含越权拒收）写 AiInteractionLog 全字段（role/promptText/aiReply/codeBefore/
codeAfter/codeDiff/gateResult/gateType/model/tokens/confidence/sessionId）+ upsert
CheckpointProgress（attempts+1、passed、首次 unlockedAt）。

## Files created

- `src/lib/checkpoint/lockCheck.ts` - `checkEditorLock(code, allowedUnlockedLines, baseline?)`：
  单区间/区间数组、1-based 闭区间、baseline 严格模式（锁定行须与模板逐字符一致）与
  无 baseline MVP 兜底（锁定行必须为空）
- `src/lib/checkpoint/evaluate.ts` - `evaluateCheckpoint(checkpoint, {code, studentAnswer}, options?)`
  + `loadHiddenTests`；DI `options.ai / options.judge` 可注入假 provider
- `src/app/api/checkpoint/verify/route.ts` - 鉴权（Bearer verifyToken，body.studentId MVP 兜底）、
  限流（AI_RATE_LIMIT 5 次/checkpoint → 429）、硬锁、求值、日志/进度落库、解锁信息回传

## Key decisions

1. **低置信度不计分** - `confidence < 0.7` 的 ai gate 即使模型判 pass 也视为不过关 +
   escalated（否则 escalation 无意义，关卡会照常自动解锁）。
2. **baseline 严格模式** - 全文件提交流程下锁定行是脚手架（非空），纯「非空即越权」
   启发式会误杀；body 传 `baseline`（起始模板）后锁定行须与模板一致。无 baseline 时
   走任务书指定的 MVP 兜底（锁定行必须为空）。
3. **regex 双对象匹配** - rule 同时对回答与代码测试（schema 注释说匹配回答，任务书说
   匹配代码，二者任一命中即过，兼容两种语义）。
4. **限流前置** - 含 ai_socratic gate 的 checkpoint 在求值前整体检查额度（复用 socratic
   的 checkRateLimit），第 6 次 429「请联系教师放行」。
5. **DB 不可用不阻断判定** - 落库全部 try/catch 降级 console.error（脱敏），判定结果
   照常返回；本机 Postgres 未运行，落库路径经代码审查 + 降级路径实测。
6. **每 gate 一行日志** - 一次 verify 写 N 行（N=gates 数），共享 sessionId（randomUUID），
   codeBefore 取该学生该关卡上一条 codeAfter 形成回放链，codeDiff 用最小行级 diff。
7. **熔断未复制** - evaluate 直连 provider 不复用 socratic 路由的模块级熔断器
   （避免跨请求共享状态的隐式耦合）；provider 故障表现为 gate escalated + 错误码。

## Verification

```
pnpm lint           -> ✔ No ESLint warnings or errors
pnpm build          -> ✓ Compiled successfully; ƒ /api/checkpoint/verify registered
```

### HTTP 冒烟（mock AI，dev server :3189）— 25/25 PASS

| Test | 场景 | 结果 |
| ---- | ---- | ---- |
| T1 | 无 bearer 无 studentId → 401（中间件拦截） | ✅ |
| T2 | 缺 taskId → 400 invalid_input | ✅ |
| T3/T4 | 未知 task/checkpoint → 404 | ✅ |
| T5 | 锁定行非空（无 baseline）→ 403 + escalated + violations | ✅ |
| T6 | cp1 正确回答 → 200 passed, score=1.0, nextCheckpointId=cp2, unlockRegions=[[16,30]], ai reply | ✅ |
| T7 | 错误回答 → regex gate failed, 0.6 < 0.7 不过关 | ✅ |
| T8a | baseline 模式：锁定行被改 → 403 | ✅ |
| T8b | 可编辑区实现 fib → test_pass 真 gcc 编译 AC → passed | ✅ |
| T8c | 错误实现 → WA failed + testHint 性质描述，expected 未泄露 | ✅ |
| T9 | 同 (student, checkpoint) 第 6 次 AI 验证 → 429 | ✅ |

### 单元校验（注入假 provider）— 24/24 PASS

- lockCheck：单区间/多区间/CRLF/baseline 逐字符比对/仅区间内内容放行
- evaluate：regex 命中与非法规则、AI pass+0.9、AI 低置信度 0.5 → escalated 且不计分、
  AI fail、provider 抛错 → escalated、test_pass 全 AC / WA+hint 不泄题 / 文件缺失 escalated、
  权重求和 0.4 vs 阈值 0.4/0.7 边界

## Gotchas

1. **JWT_SECRET 在 .env 里带引号** - Next 的 @next/env 会剥引号，PowerShell 手工提取
   不带引号剥离 → 签名不匹配，全部请求被中间件 401。必须 dequote 后再生成测试 token。
2. **`[5,15]` 运行时就是数组** - 用 `Array.isArray` 区分「单区间 vs 区间数组」会把
   单个 tuple 误判为列表（`for (const [s,e] of [5,15])` → "5 is not iterable"）。
   改用「首元素是 number」判别。
3. **中间件挡在 body.studentId 兜底之前** - /api/checkpoint/* 全被中间件要求 bearer，
   body.studentId 兜底只在绕过中间件（测试/后续改造）时生效；所有集成测试必须带
   合法 token。
4. **隐藏测试是 todo 20 的交付物** - QA 临时创建 hidden_tests/fib_2.json 验证
   test_pass 真编译路径后已删除，仓库保持干净；缺文件时 gate 返回 escalated +
   hidden_tests_unavailable 不崩。
5. **DB 未运行（localhost:5432 关闭）** - AiInteractionLog/CheckpointProgress 落库
   经代码路径 + 降级验证；Postgres 起来后无需改动即可落库（Prisma 查询已由
   prisma:query 日志确认正确构造）。
