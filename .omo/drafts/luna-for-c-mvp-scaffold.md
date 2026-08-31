---
slug: luna-for-c-mvp-scaffold
status: awaiting-approval
intent: clear
review_required: false
pending-action: write .omo/plans/luna-for-c-mvp-scaffold.md
approach: 轻量栈 Next.js 14 App Router + Monaco + judge-lite(Docker优先/local回退) + OpenAI-Compatible AI网关 + Prisma+Postgres + Gate DSL Checkpoint硬门控 + AGENTS.md/README.md，单机 Docker Compose 可运行，Windows优先兼容
---

# Draft: luna-for-c-mvp-scaffold

## Components (topology ledger)

<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->

| id  | outcome (one line)                                        | status | evidence path                                            |
| --- | --------------------------------------------------------- | ------ | -------------------------------------------------------- |
| C1  | Next.js 14 + Monaco IDE 外壳与学号鉴权可运行              | active | 项目分析文档.md:7.1, 7.3                                 |
| C2  | judge-lite 沙箱（Docker gcc + local gcc回退）真编译真判题 | active | 项目分析文档.md:7.2, 11.1; explore找: gcc -std=c11 -Wall |
| C3  | Checkpoint Gate DSL 引擎 + 前后端硬锁双校验               | active | 项目描述.md:57-92; 项目分析文档.md:8.1                   |
| C4  | AI Gateway Socratic 限流网关 + prompt硬规则               | active | 项目分析文档.md:8.2, 12.2                                |
| C5  | Prisma+Postgres 日志与教师大盘（时间线回放+CSV）          | active | 项目分析文档.md:10.1, 8.3                                |
| C6  | AGENTS.md / README.md + 示例题库与部署文档                | active | 本次请求显式要求                                         |

## Open assumptions (announced defaults)

<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->

| assumption   | adopted default                                               | rationale                                      | reversible?                    |
| ------------ | ------------------------------------------------------------- | ---------------------------------------------- | ------------------------------ |
| 包管理器     | pnpm + Node 20 LTS                                            | Next.js/Prisma生态主流，lock一致性好           | 是                             |
| 数据库       | Postgres 16 via Docker Compose（不做SQLite过渡）              | 日志需 JSONB/code_diff，Prisma迁移与生产一致   | 是（可加sqlite分支但增加维护） |
| AI首期提供方 | OpenAI-Compatible抽象，默认 DeepSeek API（env切换qwen-local） | 校内GPU不确定时0门槛启动，论文可写“支持私有化” | 是（env一键切）                |
| 判题默认     | Docker优先，自动探测不可用回退local gcc                       | Windows常无Docker，硬依赖会卡启动              | 是                             |
| 鉴权         | 学号/工号+密码JWT本地表，不对接校内统一身份                   | MVP最快，抽象AuthProvider二期可插              | 是                             |
| 题库种子     | fib递归 + 单链表逆置 2题，Gate DSL示例同项目分析8.1           | 覆盖递归/指针/边界，支撑软著截图与论文对照     | 是                             |
| 前端UI       | Next.js App Router + Shadcn UI + xterm外观（不引Theia）       | 1周可跑，Theia延期风险                         | 否（重型可选）                 |

## Findings (cited - path:lines)

- 项目根仅含 项目描述.md:1-128 与 项目分析文档.md:全，空仓需从零脚手架； .codegraph 已建但无代码（glob 10 files, 仅md/db）
- 原方案重型瓶颈：Theia定制 2-3月/Judge0四组件运维/AI误判20-30%（项目分析文档.md:4.风险1-3）；轻量MVP已给出替代：Next.js+Monaco+judge-lite+网关解耦（项目分析文档.md:6,7.1）
- Gate DSL已定义 weight+threshold+unlock.editorRegion+on_fail.ai_followup（项目分析文档.md:8.1:274-302）；需前后端双校验（项目分析文档.md:7.3）
- Socratic system prompt硬规则：禁>5行完整函数、必反问、JSON判分confidence<0.7转escalated（项目分析文档.md:8.2）
- 日志最小字段已定：AiInteractionLog含 prompt/aiReply/codeBefore/After/codeDiff/gateResult/model/tokens/sessionId（项目分析文档.md:10.1:362-381）
- Next.js 14 约定：App Router文件路由、_private与route groups、server-only守卫、Prisma globalThis单例、Bun需--bun、Monaco需ssr:false动态加载（librarian研究综合Next.js 14/Prisma/Monaco官方文档）
- Windows判题坑：Docker未装/WSL未起、volume路径冒号、信号码差异、valgrind仅容器内（explore研究）；需docker info探测+local回退+统一RE/signal归一化

## Decisions (with rationale)

- 采用 pnpm + Next.js 14.2 + TypeScript strict + ESLint (.eslintrc.json next/core-web-vitals) + Prisma 5 + Postgres 16 + Docker Compose 单机（证据：librarian Next14仍用.eslintrc.json；项目分析11.1 compose拓扑）
- 前端Monaco用 @monaco-editor/react + dynamic ssr:false + loader CDN默认，自托管可选 monaco-editor（证据：librarian Monaco Next.js章节）
- 后端统一 Provider 抽象：JudgeProvider {run({language,source,stdin,limits})=>{status,stdout,stderr,signal,timeMs,memoryKb,valgrind?}} 与 AIProvider {complete(prompt)=>{text,usage}}，env工厂切换（证据：librarian provider registry模式）
- judge-lite 单服务双Runner：dockerRunner.ts（docker run --rm --network=none --memory=256m --pids-limit=64 --read-only） vs localRunner.ts（MinGW gcc探测+mkdtemp+timeout 5s+maxBuffer），health端点探测docker info（证据：explore Windows fallback设计）
- Checkpoint引擎文件化：tasks/*.json 为真源，Zod校验，/api/checkpoint/verify 统一入口，前端deltaDecorations灰显+onBeforeChange回滚（证据：项目分析7.3硬锁）
- AI网关限流：每checkpoint 5次/熔断/日志脱敏/注入过滤，system prompt写死服务端（证据：项目分析8.2,12.2）
- 日志表按项目分析10.1 Prisma模型落地，教师端 /dashboard 回放 + /api/logs CSV导出（证据：项目分析8.3）

## Scope IN

- Next.js脚手架、Monaco编辑器、文件树、Luna侧栏、Checkpoint遮罩、教师看板占位
- /api/judge/run, /api/ai/socratic, /api/checkpoint/verify, /api/logs, /api/auth 基础实现
- judge-lite 双模式 + Docker Compose + .env.example
- Prisma schema/migrations/seed（User/Task/AiInteractionLog/CheckpointProgress）
- tasks/fib_L2.json + tasks/linked_list_reverse.json + hidden_tests/*.json
- AGENTS.md（AI代理守则） + README.md（人类上手） + 项目分析文档保留作引用
- 预留 JudgeProvider/AIProvider/GateProvider 扩展点文档与示例

## Scope OUT (Must NOT have)

- 不引入 Eclipse Theia / code-server 重型IDE（延期风险，列为二期可选）
- 不部署 Judge0 CE 四组件（首版用judge-lite，接口兼容以便平滑迁移）
- 不私有化部署 Qwen/DeepSeek 本地模型（首版API网关抽象，二期vLLM）
- 不对接校内统一身份/超星/学堂在线（首版本地JWT，抽象AuthProvider）
- 不做 Moss/JPlag 查重、k8s、MinIO对象存储等重型运维
- 不改写项目描述.md/项目分析文档.md 原文（只新增引用）

## Open questions

- Q1: AI首期默认提供方是否接受 DeepSeek API（成本~50元/学期）而非校内Qwen私有化？（影响 .env 默认与论文表述）
- Q2: 判题默认是否接受 Docker优先+自动回退local（Windows无Docker也能跑），而非强制Docker？
- Q3: 鉴权是否接受本地学号表JWT首版，校内统一身份延至二期？
- 均有推荐默认（见上表），跳过即按默认入计划；测试策略需确认：tests-after（Vitest/Playwright）还是 none？（推荐 tests-after + agent-executed QA）

## Approval gate

status: awaiting-approval
approach: 见上 — 轻量栈6组件并行脚手架，Windows优先，Provider抽象可插拔
pending-action: write .omo/plans/luna-for-c-mvp-scaffold.md
next: 等待用户显式 okay（yes/approve/按默认推进均可）；批准后仅写计划文件，不启动实现；实现由独立worker经 $start-work 触发
