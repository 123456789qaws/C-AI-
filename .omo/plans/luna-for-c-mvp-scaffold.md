# luna-for-c-mvp-scaffold - Work Plan

## TL;DR (For humans)

**What you'll get:** 一个可 `pnpm dev` + `docker compose up` 一键跑起的 Luna-for-C MVP：Monaco 编辑器+两道 Checkpoint 关卡硬门控+真 gcc 判题+只问不给的 Socratic AI 侧栏+全量日志与 CSV 导出，所有能力可在 Windows 无 Docker 环境回退运行，并附带 AI 代理守则与人类上手文档。

**Why this approach:** 放弃 Theia/Judge0 重型栈，用 Next.js 14+Monaco+judge-lite+AI 网关抽象的轻量组合——1 周可演示、Windows 兼容、后期可热插拔回重型实现，且判题与 AI 均不阻塞启动。

**What it will NOT do:** 不引入 Theia/code-server，不部署 Judge0 四组件，不私有化部署大模型，不对接校内统一身份/教务系统，不做查重与 k8s。

**Effort:** Medium
**Risk:** Medium - Windows Docker 缺失与本地 gcc 差异是主要风险，已用双 Runner 回退兜底
**Decisions to sanity-check:** AI 首期默认 DeepSeek API（env 切 qwen-local）；判题 Docker 优先自动回退 local；鉴权本地 JWT；测试 tests-after

Your next move: 批准后由 worker 执行 `$start-work luna-for-c-mvp-scaffold`。 Full execution detail follows below.

---

> TL;DR (machine): Medium effort, Medium risk, 6-component MVP with 22 todos + 4 final verifiers

## Scope

### Must have

- Next.js 14.2 App Router + TypeScript strict + pnpm + ESLint(.eslintrc.json) + Prettier + Shadcn UI 基座
- Monaco Editor（@monaco-editor/react, ssr:false）+ 文件树 + Luna 侧栏 + Checkpoint 灰显只读
- judge-lite 双模式沙箱：dockerRunner（gcc:13, --network=none等）+ localRunner（MinGW探测+tmp隔离+timeout 5s）+ 统一 /api/judge/run
- Checkpoint Gate DSL：tasks/*.json（Zod 校验）+ /api/checkpoint/verify + 前后端硬锁双校验
- AI Gateway：OpenAI-Compatible 抽象 + system prompt硬规则 + 限流5次/checkpoint + 熔断日志
- Prisma 5 + Postgres 16 + Docker Compose + 种子迁移（User/Task/AiInteractionLog/CheckpointProgress）
- 种子题库：tasks/fib_L2.json + tasks/linked_list_reverse.json + hidden_tests/*.json（含 valgrind 线索）
- 教师占位：/dashboard 时间线回放 + 热力占位 + /api/logs CSV 导出
- AGENTS.md + README.md + .env.example + docs/extension-points.md
- Windows 优先：docker info 探测、路径归一、信号码归一、无 Docker 也可演示

### Must NOT have (guardrails, anti-slop, scope boundaries)

- 不引入 Eclipse Theia / code-server / Judge0 CE / 私有 vLLM / 校内统一身份对接
- 不在 Next.js 进程内直接执行用户 C 代码
- 不输出 >5 行完整函数体的 AI 回复（Socratic 硬规则）
- 不将 secrets 写入仓库或传至前端（server-only 守卫）
- 不手写 SQL 替代 Prisma 迁移；不绕过 Gate 直接解锁
- 不新增 .omo 之外的计划外文档结构（README/AGENTS 除外）
- 不为验证而伪造 passing 日志（所有 QA 需真实跑命令并落 Evidence）

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: **tests-after + agent-executed QA** | Framework: **Vitest 1.x（单元）+ Playwright（冒烟）** | Runner: `pnpm test`, `pnpm exec playwright test --project=chromium`
- Evidence: `.omo/evidence/luna-for-c-mvp-scaffold/task-<N>-<slug>.md`（含命令、输出、截图路径）；无 ulw-loop 时用 `.omo/evidence/task-<N>-...`
- 关键不变量：CE/WA/RE/TLE/signal 正确回传；Socratic >5行阻断；未解锁区后端拒收；日志全字段落库；Docker缺失回退可用

## Execution strategy

### Parallel execution waves

> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

- Wave 1: 基座与工具链（Todos 1-4，可并行）
- Wave 2: IDE 外壳与 Monaco（Todos 5-7，依赖 Wave1）
- Wave 3: judge-lite 双 Runner（Todos 8-10，可与 Wave2 并行，依赖 Wave1）
- Wave 4: Checkpoint 引擎与硬锁（Todos 11-13，依赖 Wave2+3）
- Wave 5: AI 网关（Todos 14-16，依赖 Wave1，可与 Wave4 并行）
- Wave 6: 数据/鉴权/种子题与看板（Todos 17-20，依赖 Wave4+5）
- Wave 7: AGENTS/README 与收尾（Todos 21-22，依赖全量）

### Dependency matrix

| Todo | Depends on | Blocks    | Can parallelize with |
| ---- | ---------- | --------- | -------------------- |
| 1    | -          | 2,3,4,5,8 | 2,3,4                |
| 2    | 1          | 5,8,14    | 3,4                  |
| 3    | 1          | 6,17      | 2,4                  |
| 4    | 1          | 8         | 2,3                  |
| 5    | 1,2        | 6,11      | 8,9,14               |
| 6    | 5          | 11        | 8,9,14               |
| 7    | 5          | 11        | 8,9,14               |
| 8    | 1,4        | 9,11      | 5,6,14               |
| 9    | 8          | 10,11     | 5,6,14               |
| 10   | 9          | 11        | 5,6,14               |
| 11   | 6,10       | 12,17     | 14,15                |
| 12   | 11         | 13,18     | 14,15                |
| 13   | 12         | 20        | 14,15                |
| 14   | 2          | 15,18     | 5,6,11               |
| 15   | 14         | 16,18     | 11,12                |
| 16   | 15         | 18        | 11,12                |
| 17   | 3          | 18        | 14,15                |
| 18   | 12,16,17   | 19        | 13                   |
| 19   | 18         | 20        | 13                   |
| 20   | 13,19      | 21        | 21                   |
| 21   | 20         | 22        | -                    |
| 22   | 21         | -         | -                    |

## Todos

- [x] 1. 初始化 Next.js 14 + pnpm + TS strict + ESLint/Prettier + Shadcn 基座
      What to do / Must NOT do: 用 `pnpm create next-app@14.2`（App Router, TS, ESLint, src/），配 `tsconfig strict:true`、` .eslintrc.json extends next/core-web-vitals`、Prettier、Shadcn init；添加 `lint`, `dev`, `build` 脚本；Must NOT 升级到 Next15 扁平 eslint 或引入 Theia。
      Parallelization: Wave 1 | Blocked by: - | Blocks: 2,3,4,5,8
      References (executor has NO interview context - be exhaustive): 项目分析文档.md:6 选型表、7.1 架构；Next.js 14 docs project-structure/colocation；librarian研究 Next14 .eslintrc.json 约定
      Acceptance criteria (agent-executable): `pnpm lint` 0 error；`pnpm build` 成功产出 `.next/`；`pnpm dev` 3000 可访问空页面
      QA scenarios (name the exact tool + invocation): happy: `pnpm lint && pnpm build` 通过，Evidence `.omo/evidence/luna-for-c-mvp-scaffold/task-1-build.md` 含日志；failure: 故意 `tsconfig strict false` 改回 true 后 `pnpm lint` 告警被捕获
      Commit: Y | chore(scaffold): init Next14 pnpm strict eslint prettier shadcn

- [x] 2. 建立 .env 体系与基础配置（env.example + server-only 守卫）
      What to do / Must NOT do: 创建 `.env.example`（DATABASE_URL, AI_PROVIDER=deepseek-api, DEEPSEEK_API_KEY, QWEN_URL, JUDGE_MODE=auto, JUDGE_URL, JWT_SECRET），配 `src/lib/env.ts` 用 zod 校验，`src/lib/config.ts` 导出 typed config；所有含 key 的 provider 代码首行 `import 'server-only'`；Must NOT 将真实 key 提交。
      Parallelization: Wave 1 | Blocked by: 1 | Blocks: 5,8,14
      References (executor has NO interview context - be exhaustive): 项目分析文档.md:11.2 成本/AI切换；AGENTS草案 server-only；librarian server-only 守卫
      Acceptance criteria (agent-executable): `pnpm build` 不泄露 env 到 client bundle（检查 `.next/static` 无 DEEPSEEK 串）；`import 'server-only'` 误引 client 时抛错
      QA scenarios (name the exact tool + invocation): happy: `pnpm build && grep -r DEEPSEEK .next/static || echo no-leak` 证不泄露，Evidence task-2；failure: 在 client 组件 `import {config}` 触发 server-only 报错
      Commit: Y | feat(config): env example zod validation server-only guard

- [x] 3. 落地 Prisma 5 + Postgres 16 schema 与迁移
      What to do / Must NOT do: `pnpm add prisma @prisma/client @prisma/adapter-pg pg` + `pnpm dlx prisma init`，按 项目分析文档.md:10.1 建 `User/Task/AiInteractionLog/CheckpointProgress` 四表（Task.checkpoints Json, AiInteractionLog 含 codeDiff/sessionId/confidence 等），`src/lib/db.ts` 用 globalThis 单例+Pg adapter；`prisma/migrations` 首版迁移；Must NOT 手写 SQL 绕过迁移。
      Parallelization: Wave 1 | Blocked by: 1 | Blocks: 6,17
      References (executor has NO interview context - be exhaustive): 项目分析文档.md:10.1 Prisma模型；librarian Prisma globalThis 单例+adapter
      Acceptance criteria (agent-executable): `pnpm prisma migrate deploy` 成功；`pnpm prisma generate` 产出 client；`node -e "import('./src/lib/db.ts').then(m=>m.prisma.$queryRaw\`select 1\`)"`连通（Docker起后）
QA scenarios (name the exact tool + invocation): happy:`pnpm prisma migrate dev --name init`+`pnpm exec vitest run src/lib/db.test.ts` 单例测试通过；failure: 重复 hot-reload 不建多 Client（检查 globalThis 缓存）Evidence task-3
      Commit: Y | feat(db): prisma schema four tables singleton adapter

- [x] 4. Docker Compose 单机编排与启动脚本
      What to do / Must NOT do: 创建 `docker-compose.yml`（web:3000, db:postgres:16, judge-lite 可选常驻），`Dockerfile` 多阶段，`pnpm run judge:health` 脚本（`docker info` 探测），`README` 占位说明 `pnpm i && docker compose up -d && pnpm prisma migrate && pnpm dev`；Must NOT 假定宿主必有 Docker（需健康探测与回退提示）。
      Parallelization: Wave 1 | Blocked by: 1 | Blocks: 8
      References (executor has NO interview context - be exhaustive): 项目分析文档.md:11.1 compose拓扑；explore Windows Docker坑
      Acceptance criteria (agent-executable): `docker compose config` 校验通过；`pnpm run judge:health` 在无 Docker 时返回 WARN 且不崩；有 Docker 时 `docker compose up -d --build` 可起 db
      QA scenarios (name the exact tool + invocation): happy: `docker compose up -d db && pg_isready` 通过，Evidence task-4；failure: 停 Docker 守护后 `pnpm run judge:health` 仍优雅 WARN
      Commit: Y | chore(deploy): docker-compose single-node with health check

- [x] 5. 搭建 App Router 布局与基础路由（(ide) 组 + 组件目录）
      What to do / Must NOT do: 建 `src/app/layout.tsx`（html/body）、`src/app/(ide)/layout.tsx`（三栏：Monaco区/Luna侧栏）、`src/app/(ide)/page.tsx` 占位、`src/app/api/health/route.ts`、`src/components/ui/*`（Shadcn Button/Card）、`src/components/editor/*` 空壳；Must NOT 将业务逻辑写入 layout。
      Parallelization: Wave 2 | Blocked by: 1,2 | Blocks: 6,11
      References (executor has NO interview context - be exhaustive): librarian route groups / colocation；项目分析文档.md:7.1 前端结构
      Acceptance criteria (agent-executable): `pnpm build` 路由表含 `/(ide)` 与 `/api/health`；访问 `/api/health` 返回 `{ok:true}`
      QA scenarios (name the exact tool + invocation): happy: `curl localhost:3000/api/health` 200，Playwright 访问 `/` 见三栏占位 Evidence task-5；failure: 删 `src/app/layout.tsx` 时 build 失败提示缺 root layout
      Commit: Y | feat(ui): app router layout ide group health route

- [x] 6. 集成 Monaco Editor（只读遮罩与文件树占位）
      What to do / Must NOT do: `pnpm add @monaco-editor/react monaco-editor`，`src/components/editor/MonacoWorkspace.tsx` 用 `dynamic(ssr:false)` + `loader.config`，实现 `lockedRegions: number[][]` 的 `deltaDecorations` 灰显 + `onBeforeChange` 越权回滚，`src/components/editor/FileTree.tsx` 占位；Must NOT 在 server 组件直接 import monaco。
      Parallelization: Wave 2 | Blocked by: 5 | Blocks: 11
      References (executor has NO interview context - be exhaustive): 项目分析文档.md:7.3 硬锁前端；librarian Monaco ssr:false + workers 前斜杠
      Acceptance criteria (agent-executable): `pnpm build` 无 ssr 报错；浏览器中 Monaco 可输入，未解锁行灰显且无法编辑（Playwright 断 `locked-region` class）
      QA scenarios (name the exact tool + invocation): happy: Playwright `monaco.spec.ts` 测可编辑区输入成功、锁定区输入被回滚 Evidence task-6；failure: 尝试改锁定区触发 `onBeforeChange` 回滚且无崩
      Commit: Y | feat(editor): monaco ssr:false locked regions decorations

- [x] 7. Luna 侧栏与教师看板占位（无逻辑，仅结构）
      What to do / Must NOT do: `src/components/luna/LunaPanel.tsx`（Socratic 对话列表+输入+限流提示）、`src/app/(teacher)/dashboard/page.tsx`（时间线+热力占位+CSV按钮）、`src/lib/mock/*` 临时 mock；Must NOT 在此波接真实 AI/日志。
      Parallelization: Wave 2 | Blocked by: 5 | Blocks: 11
      References (executor has NO interview context - be exhaustive): 项目分析文档.md:8.3 大盘、5.3 旅程
      Acceptance criteria (agent-executable): 访问 `/dashboard` 见占位；Luna 面板可本地 mock 对话滚动
      QA scenarios (name the exact tool + invocation): happy: Playwright 访问 `/dashboard` 截图 Evidence task-7；failure: 空数据时不白屏（显空状态）
      Commit: Y | feat(ui): luna panel teacher dashboard placeholders

- [x] 8. 定义 JudgeProvider 抽象与 /api/judge/run 契约
      What to do / Must NOT do: 建 `src/lib/providers/judge/types.ts`（JudgeProvider接口：run({language,source,stdin,limits})=>{status,stdout,stderr,signal,timeMs,memoryKb,valgrind?}}，Verdict=AC/WA/CE/RE/TLE），`src/lib/providers/judge/index.ts` 工厂（JUDGE_MODE auto/docker/local），`src/app/api/judge/run/route.ts` 薄包装校验 MAX_CODE_SIZE 64KB；Must NOT 在此实现具体执行。
      Parallelization: Wave 3 | Blocked by: 1,4 | Blocks: 9,11
      References (executor has NO interview context - be exhaustive): 项目分析文档.md:7.2 POST /api/judge/run 契约；librarian Judge0/Piston 接口
      Acceptance criteria (agent-executable): `POST /api/judge/run` 非法入参返回 400；超 64KB 返回 413；契约字段完整
      QA scenarios (name the exact tool + invocation): happy: Vitest `judge/types.test.ts` 校验工厂 env 切换，Evidence task-8；failure: 传超大 code 被 413 拒
      Commit: Y | feat(judge): provider interface api contract

- [x] 9. 实现 judge-lite 双 Runner（docker + local 回退）
      What to do / Must NOT do: 建 `judge-lite/src/dockerRunner.ts`（`docker run --rm --network=none --memory=256m --pids-limit=64 --read-only --tmpfs /tmp gcc:13 bash -c "gcc -std=c11 -Wall -Wextra -O2 main.c -o main && timeout 5s ./main < input"`，解析 signal/time，valgrind 可选）与 `judge-lite/src/localRunner.ts`（`where gcc` 探测、mkdtemp、spawn+timeout+maxBuffer、归一化 Windows 信号、valgrind=null），`judge-lite/src/index.ts` 统一导出+health；`src/lib/providers/judge/docker.ts`/`local.ts` 适配；Must NOT 在 Next 进程内直接 eval 代码。
      Parallelization: Wave 3 | Blocked by: 8 | Blocks: 10,11
      References (executor has NO interview context - be exhaustive): 项目分析文档.md:7.2 gcc flags；explore judge-lite Windows坑与回退设计；librarian 安全隔离
      Acceptance criteria (agent-executable): 有 Docker 时 `gcc hello` 返回 AC；无 Docker 时自动 local 回退亦 AC；`SIGSEGV` 归一为 RE+signal；`TLE` 5s 触发
      QA scenarios (name the exact tool + invocation): happy: Vitest `judge/runners.test.ts` 测 CE/WA/RE/TLE 四态，Evidence task-9；failure: `fork bomb`/`#include <windows.h>` 被限/拒且不崩宿主
      Commit: Y | feat(judge): docker+local runners isolation fallback

- [x] 10. 判题限流与安全加固 + 隐藏测试执行器
      What to do / Must NOT do: 在 `/api/judge/run` 加 `p-limit` 并发3、单 IP 10/min 内存限流、MAX_OUTPUT 1MB、网络禁；实现 `src/lib/judge/harness.ts` 批量跑 hidden_tests（stdin/expected 数组，逐用例比对，返回首个 WA 用例的性质描述而非直接答案）；Must NOT 回显完整 expected。
      Parallelization: Wave 3 | Blocked by: 9 | Blocks: 11
      References (executor has NO interview context - be exhaustive): 项目分析文档.md:12.1 沙箱限权；12.4 隐藏测试性质描述
      Acceptance criteria (agent-executable): 批量隐藏测试 3 用例中 1 WA 时返回 WA+性质提示不泄题；并发4请求时第4被限流
      QA scenarios (name the exact tool + invocation): happy: `hidden_tests.test.ts` 3用例批量跑，Evidence task-10；failure: 10次并发触发 429 且服务不挂
      Commit: Y | feat(judge): harness hidden tests rate-limit safety

- [ ] 11. Checkpoint Gate DSL 与 Zod 校验（tasks 真源）
      What to do / Must NOT do: 建 `src/lib/checkpoint/schema.ts`（Zod：Task {id,title,checkpoints: {id,title,guide_question,gates:{type:regex|ai_socratic|test_pass,rule/rubric/tests,weight}[],pass_threshold,unlock:{editorRegion},on_fail:{ai_followup,valgrind_hint}}[]}），`src/lib/checkpoint/loader.ts` 读 `tasks/*.json`，`tasks/fib_L2.json` 与 `tasks/linked_list_reverse.json` 按 8.1 示例落地；Must NOT 让前端直接改 tasks。
      Parallelization: Wave 4 | Blocked by: 6,10 | Blocks: 12,17
      References (executor has NO interview context - be exhaustive): 项目分析文档.md:8.1 Gate DSL JSON；项目描述.md:59-78 关卡结构
      Acceptance criteria (agent-executable): `pnpm exec vitest run checkpoint/schema.test.ts` 校验 2 任务通过；非法 gate 被 Zod 拒
      QA scenarios (name the exact tool + invocation): happy: loader 读 fib_L2 见 2 checkpoints，Evidence task-11；failure: 缺 unlock.editorRegion 时 Zod 报错定位
      Commit: Y | feat(checkpoint): gate dsl zod tasks seed

- [ ] 12. 后端硬锁与 /api/checkpoint/verify 三级漏斗
      What to do / Must NOT do: 实现 `src/app/api/checkpoint/verify/route.ts`：1) 正则初筛 2) AI 复核（调 AI Gateway，confidence<0.7 标 escalated）3) test_pass 调 judge-lite；校验提交 code 的 editorRegion 越权（超范围编辑直接 passed=false+escalated），写 `AiInteractionLog` + `CheckpointProgress`；`src/lib/checkpoint/evaluate.ts` 权重求和 vs pass_threshold；Must NOT 仅靠前端锁。
      Parallelization: Wave 4 | Blocked by: 11 | Blocks: 13,18
      References (executor has NO interview context - be exhaustive): 项目分析文档.md:7.3 双校验、7.2 verify 契约、8.1 weight/threshold、12.5 诚信
      Acceptance criteria (agent-executable): 未解锁区篡改提交被 403+escalated；ai_socratic 低 confidence 自动 escalated；test_pass 走 judge 真编译
      QA scenarios (name the exact tool + invocation): happy: Vitest `checkpoint/verify.test.ts` 4态（regex/ai/test/combined），Evidence task-12；failure: F12 改前端后后端仍拒并标红
      Commit: Y | feat(checkpoint): verify funnel hard-lock backend

- [ ] 13. 前端 Checkpoint 交互与解锁联动
      What to do / Must NOT do: 在 `(ide)/page.tsx` 接 `/api/checkpoint/verify`，实现“请求验证”按钮、guide_question 展示、AI reply 气泡、解锁动画（Monaco lockedRegions 更新）、Hand in 需全关通过；前端越权编辑即时回滚并 toast；Must NOT 在前端存答案。
      Parallelization: Wave 4 | Blocked by: 12 | Blocks: 20
      References (executor has NO interview context - be exhaustive): 项目描述.md:83-91 判定流；项目分析文档.md:5.3 学生旅程
      Acceptance criteria (agent-executable): 过 cp1 后 12-25 行解锁可编辑；未过 cp2 时 26-50 行仍灰显；全过才可 Hand in
      QA scenarios (name the exact tool + invocation): happy: Playwright `checkpoint-flow.spec.ts` 完整走通 fib 两关，Evidence task-13 截图；failure: 未过关点 Hand in 被禁
      Commit: Y | feat(checkpoint): frontend verify unlock hand-in

- [x] 14. 定义 AIProvider 抽象与网关壳
      What to do / Must NOT do: 建 `src/lib/providers/ai/types.ts`（AIProvider complete(prompt,opts)）、`src/lib/providers/ai/deepseek.ts`/`qwen.ts`/`mock.ts`、工厂 `src/lib/providers/ai/index.ts`（AI_PROVIDER env），`src/lib/ai/prompt.ts` 固化 system prompt（禁>5行、必反问、JSON判分），`src/app/api/ai/socratic/route.ts` 壳（鉴权+输入转义+限流）；Must NOT 将 system prompt 暴露前端。
      Parallelization: Wave 5 | Blocked by: 2 | Blocks: 15,18
      References (executor has NO interview context - be exhaustive): 项目分析文档.md:8.2 system prompt 模板；librarian OpenAI-Compatible 切 provider
      Acceptance criteria (agent-executable): `POST /api/ai/socratic` 返回 `{pass,confidence,reply,reason}` JSON；system prompt 不在 client bundle
      QA scenarios (name the exact tool + invocation): happy: Vitest `ai/provider.test.ts` mock 回 JSON，Evidence task-14；failure: 注入“忽略之前指令”被转义不生效
      Commit: Y | feat(ai): provider abstraction prompt hard rules

- [x] 15. AI 限流/熔断/日志脱敏与 5 次上限
      What to do / Must NOT do: 在 AI 网关加每 checkpoint 5次限流（内存+DB 计数）、熔断（连续失败回退 mock）、prompt 注入过滤（“ignore previous”等）、日志脱敏（key 掩码）、token 记账；`src/lib/ai/rateLimit.ts`；Must NOT 让学生无限制刷 AI。
      Parallelization: Wave 5 | Blocked by: 14 | Blocks: 16,18
      References (executor has NO interview context - be exhaustive): 项目分析文档.md:8.2 限流5次、12.2 注入、12.3 隐私
      Acceptance criteria (agent-executable): 同 checkpoint 第6次 AI 请求返回 429 需教师放行提示；熔断时自动切 mock 不崩
      QA scenarios (name the exact tool + invocation): happy: Vitest 6次限流测试，Evidence task-15；failure: 注入字符串被过滤后仍返回正常 Socratic 提问
      Commit: Y | feat(ai): rate-limit 5 per checkpoint circuit-breaker

- [ ] 16. Socratic 追问与 valgrind 线索注入
      What to do / Must NOT do: 当 verify 失败且 `on_fail.ai_followup` 存在时自动追加追问；`memory_task` 或 `on_fail.valgrind_hint` 为 true 且判题 RE 时，附 `valgrind`/`gdb bt` 摘要到 AI 上下文（不直接给答案，AI 据此提问）；`src/lib/ai/context.ts`；Must NOT 直接把栈贴给学生当答案。
      Parallelization: Wave 5 | Blocked by: 15 | Blocks: 18
      References (executor has NO interview context - be exhaustive): 项目分析文档.md:8.1 on_fail、9 表段错误/valgrind
      Acceptance criteria (agent-executable): 段错误用例失败后 AI 回复含“打印地址/哪一行 NULL”类 Socratic 提问且不含完整修复代码
      QA scenarios (name the exact tool + invocation): happy: Vitest 段错误 Socratic 流，Evidence task-16；failure: 完整函数体输出被网关拦截（>5行阻断）
      Commit: Y | feat(ai): followup valgrind socratic injection

- [x] 17. 认证与会话（学号 JWT）及种子数据
      What to do / Must NOT do: `src/lib/auth/*`（bcrypt+JWT，role STUDENT/TEACHER/TA），`src/app/api/auth/login|logout|me`，中间件鉴权，`prisma/seed.ts` 造 2 教师+5 学生+2 Task，`src/lib/auth/provider.ts` 抽象以便二期换校内 IAM；Must NOT 明文存密码。
      Parallelization: Wave 6 | Blocked by: 3 | Blocks: 18
      References (executor has NO interview context - be exhaustive): 项目分析文档.md:10.1 User模型；15.2 人力看板
      Acceptance criteria (agent-executable): `POST /api/auth/login` 正确学号得 JWT，错误 401；`seed` 后 DB 有 2 Task 可查
      QA scenarios (name the exact tool + invocation): happy: Vitest `auth.test.ts` 登录+鉴权，Evidence task-17；failure: 未登录访 `/api/checkpoint/verify` 401
      Commit: Y | feat(auth): jwt seed abstraction

- [ ] 18. 日志落库与回放 API（AiInteractionLog 全字段）
      What to do / Must NOT do: 在 verify 与 ai 网关调用处写 `AiInteractionLog`（含 codeDiff via diff 库、sessionId、gateResult/Type、model、tokens、confidence），`src/app/api/logs/route.ts`（按 studentId+taskId 聚合时序，教师可见全量，学生仅己），支持 `?format=csv` 导出脱敏；Must NOT 漏写任何一次验证。
      Parallelization: Wave 6 | Blocked by: 12,16,17 | Blocks: 19
      References (executor has NO interview context - be exhaustive): 项目分析文档.md:10.1 日志表、8.3 回放、12.3 脱敏
      Acceptance criteria (agent-executable): 连续 2 次 verify 后 `GET /api/logs?taskId=fib_L2` 返回 2 条时序且含 codeDiff；CSV 含表头可下载
      QA scenarios (name the exact tool + invocation): happy: Vitest `logs.test.ts` 写+读+CSV，Evidence task-18；failure: 未脱敏学号被掩码
      Commit: Y | feat(logs): interaction log write replay csv

- [ ] 19. 教师大盘占位实现（热力与时间线）
      What to do / Must NOT do: `src/app/(teacher)/dashboard/page.tsx` 拉 `/api/logs` 聚合：阻塞热力（cp 平均尝试/停留/escalated 率）、学生时间线（code diff + AI 对话 + gateResult 三轨）、一键 override 放行、CSV 导出按钮；Must NOT 让学生看到全班数据。
      Parallelization: Wave 6 | Blocked by: 18 | Blocks: 20
      References (executor has NO interview context - be exhaustive): 项目分析文档.md:8.3 大盘、附录B 矩阵
      Acceptance criteria (agent-executable): 教师登录可见热力与时间线，学生访问 dashboard 被 403；override 后 CheckpointProgress 立即解锁
      QA scenarios (name the exact tool + invocation): happy: Playwright `dashboard.spec.ts` 教师视角截图+Csv下载，Evidence task-19；failure: 学生直访 /dashboard 被拦
      Commit: Y | feat(dashboard): heatmap timeline override csv

- [ ] 20. 端到端冒烟与隐藏测试固化
      What to do / Must NOT do: 固化 `hidden_tests/fib_L2.json`（n=0/1/边界/大值）与 `hidden_tests/linked_list_reverse.json`（空/单节点/多节点+valgrind），`e2e/checkpoint.spec.ts` 走通“登录→答cp1→过cp2→Hand in”全流，`pnpm run seed:reset` 辅助；Must NOT 在 e2e 中用真实付费 AI（用 mock provider）。
      Parallelization: Wave 6 | Blocked by: 13,19 | Blocks: 21
      References (executor has NO interview context - be exhaustive): 项目分析文档.md:9 边界/泄漏、7.2 judge 契约
      Acceptance criteria (agent-executable): `pnpm exec playwright test e2e/checkpoint.spec.ts` 全关通过且日志落库；hidden_tests 失败时回显性质描述不泄题
      QA scenarios (name the exact tool + invocation): happy: Playwright 全流通过 Evidence task-20 视频+trace；failure: 隐藏测试 WA 时前端不暴露 expected
      Commit: Y | test(e2e): hidden tests smoke full flow

- [ ] 21. 编写 AGENTS.md（AI 代理守则，<150行，可执行）
      What to do / Must NOT do: 按 explore 结论写 `AGENTS.md`：项目规则（C11 flags/TS strict/Socratic禁>5行/双校验/日志全字段/沙箱限权）、栈边界（允许/禁止目录、Provider 抽象、env 切换）、工作流（feat/* 分支+Prisma迁移+ valgrind 附试）、安全（--network=none等）；Must NOT 超 150 行或写成散文。
      Parallelization: Wave 7 | Blocked by: 20 | Blocks: 22
      References (executor has NO interview context - be exhaustive): explore AGENTS.md 骨架；项目分析文档.md:12 安全/伦理
      Acceptance criteria (agent-executable): `AGENTS.md` 存在且含“NEVER output >5 lines”“deltaDecorations+backend double-check”“--network=none”等硬规则，可被 AI 代理直接执行
      QA scenarios (name the exact tool + invocation): happy: `grep -c "MUST NOT" AGENTS.md && wc -l AGENTS.md` 校验，Evidence task-21；failure: 缺 server-only 守卫被 review 打回
      Commit: Y | docs(agents): ai agent guardrails

- [ ] 22. 编写 README.md + .env.example 完善 + 扩展点文档（人类上手，<200行）
      What to do / Must NOT do: 写 `README.md`：What/Architecture图/API表/Setup(Windows优先 pnpm+compose+seed)/Extension Points(新Task Gate DSL、换Judge/AI、隐藏测试)/Roles/FAQ(Docker缺失回退)，补 `.env.example` 完整注释、`docs/extension-points.md` 与 `tasks/README.md`；Must NOT 含真实 key 或过时命令。
      Parallelization: Wave 7 | Blocked by: 21 | Blocks: -
      References (executor has NO interview context - be exhaustive): explore README 骨架；项目分析文档.md:11.1 compose、8.1 DSL
      Acceptance criteria (agent-executable): 新人按 README `pnpm i && docker compose up -d db && pnpm prisma migrate && pnpm dev` 可起；`pnpm build` 后 README 命令仍有效
      QA scenarios (name the exact tool + invocation): happy: 按 README 步骤在干净环境复跑录屏 Evidence task-22；failure: `.env.example` 缺字段被 zod 校验捕获
      Commit: Y | docs(readme): human onboarding extension points

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Plan compliance audit
- [ ] F2. Code quality review
- [ ] F3. Real manual QA
- [ ] F4. Scope fidelity

## Commit strategy

- 1-4: chore(scaffold) / feat(config|db|deploy) —— 基座
- 5-7: feat(ui|editor) —— 外壳
- 8-10: feat(judge) —— 沙箱
- 11-13: feat(checkpoint) —— 门控
- 14-16: feat(ai) —— 网关
- 17-19: feat(auth|logs|dashboard) —— 数据看板
- 20: test(e2e) —— 固化
- 21-22: docs(agents|readme) —— 文档
- 每 commit 前 `pnpm lint && pnpm build && pnpm test` 绿；Evidence 按 task 落盘

## Success criteria

- 可一键起：`pnpm i && docker compose up -d && pnpm prisma migrate && pnpm dev` 在 Windows 有/无 Docker 均可演示（无 Docker 自动 local 回退）
- 硬门控生效：未过 checkpoint 的代码区灰显只读且后端 403 拒收越权提交
- 真判题：C 用 `gcc -std=c11 -Wall -Wextra -O2`，CE/WA/RE/TLE/signal/valgrind 正确区分，隐藏测试不泄题
- Socratic：AI 绝不吐 >5 行完整函数，含限流5次、注入过滤、valgrind 追问，低 confidence 转 escalated
- 数据闭环：每次 verify/AI 均写 AiInteractionLog 全字段，教师可回放三轨时间线并导出脱敏 CSV
- 文档：AGENTS.md 含硬规则可被 AI 直接执行，README.md 新人可按步跑通，扩展点清晰
