# Luna-C

![Next.js](https://img.shields.io/badge/Next.js-14-black) ![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue) ![Prisma](https://img.shields.io/badge/Prisma-5-2D3748) ![License](https://img.shields.io/badge/license-MIT-green)

> 面向 C 语言课程的 Socratic 辅导与判题平台。学生按班级闯关写 C，AI 只追问不给答案；教师按班级发任务、看全量进度与日志。

## 简介

Luna-C 以“班级为入口、任务为载体、关卡为节奏”组织教学。所有任务在 `tasks/*.json` 定义，支持 AI 追问链与代码判题，隐藏测试永不回显给学生。

## 主要功能

- **角色分流与落地页**：未登录进 `/login`，已登录统一落 `/classes`；按 `STUDENT / TEACHER / TA / ADMIN` 分流视图与权限。
- **班级**：教师创建班级获 6 位邀请码，学生用邀请码加入；班级详情展示成员、已派发任务、成绩聚合。
- **学生视图**：按班级分组展示已派发任务，含截止倒计时与过期折叠；任务卡片点击进入 `/tasks/[id]` 开始闯关。
- **任务发布**：`intro` 任务简介，`checkpointMode` 为 `sequential` 顺序解锁或 `free` 自由跳转；关卡 `kind` 分 `ai` 与 `code`，`aiChain` 为教师预设追问链，`code` 关卡含 `initialCode` 与 `testsPath`，`allowAIGenerateTests` 为真时 AI 生成测试并落盘 `hidden_tests/`。
- **闯关模式**：顺序模式需逐关通过才解锁下一关，自由模式可任意切换；教师进入任务默认全解锁可预览全部关卡。
- **判题**：`judge-lite` 双 Runner，`gcc -std=c11 -Wall -Wextra -O2`，docker `gcc:13 --network=none --memory=256m --pids-limit=64 --read-only` 或本地 MinGW 子进程，绝不在 Next 进程内 eval。
- **AI 判官**：纯 `ai_socratic`，无 `regex`；`confidence < 0.7` 转 `escalated` 交教师复核，>5 行完整函数回退为追问；限流 `5/checkpoint/h`，熔断 3 次失败回 `mock`。
- **日志**：每次 verify 与 AI 调用经 `src/lib/logs/logger.ts` 落 `AiInteractionLog` 全字段，DB 挂时降级 `console.error` 不阻断判题。
- **主题**：明暗色切换，跟随系统或手动，基于 CSS 变量。

## 架构

```
浏览器
 ├─ Monaco 编辑器（灰显锁定区 + onBeforeChange 回滚，仅 UX）
 ├─ Luna AI 对话面板（Socratic，仅追问）
 ├─ /classes 班级落地页（学生加入/任务列表 / 教师管班）
 ├─ /tasks/[id] 闯关页（sequential / free，教师全解锁）
 └─ /dashboard 教师大盘（热力图 + 时间线 + 一键放行）
        │ JSON over HTTP
        ▼
┌────────────────────── Next.js 14 (App Router) ──────────────────────┐
│  /api/health  /api/auth/*  /api/judge/run  /api/ai/socratic         │
│  /api/checkpoint/verify|override  /api/logs                         │
│  /api/tasks  /api/classes  /api/classes/join  /api/assignments      │
│  /api/scores  /api/admin/import                                     │
└──────┬──────────────┬──────────────┬─────────────────────────────────┘
       │              │              │
       ▼              ▼              ▼
┌──────────────┐ ┌────────────┐ ┌────────────────────┐
│ judge-lite   │ │ AI Provider│ │ PostgreSQL 16      │
│ docker gcc:13│ │ deepseek   │ │ Prisma + pg adapter│
│ 或 local gcc │ │ qwen-local │ │ users / tasks /    │
│ 子进程隔离   │ │ mock       │ │ classes / logs /   │
└──────────────┘ └────────────┘ │ progress / scores  │
                                └────────────────────┘
```

**硬门控**：前端锁定只是体验，后端 `/api/checkpoint/verify` 与 `/api/submit` 独立校验 `editorRegion` 越权，命中直接 `403 + escalated`。

## 技术栈

| 层 | 选型 |
| :--- | :--- |
| 前端 | Next.js 14 App Router, React 18, Monaco Editor, Tailwind + shadcn, 明暗主题 |
| 后端 | Next.js Route Handlers, zod 校验, Prisma 5 + pg driver adapter |
| 判题 | judge-lite：docker gcc:13 或本地 MinGW gcc 子进程 |
| AI | Provider 抽象：`deepseek-api` / `qwen-local` / `mock` 热插拔 |
| 数据库 | PostgreSQL 16（docker compose 一键起），模型含 Class / TaskAssignment |

## 快速开始（Windows）

前置：Node.js 20+ 与 pnpm，Docker Desktop 可选。

```powershell
# 1. 装依赖
pnpm i

# 2. 起数据库（30 秒后 healthy）
docker compose up -d db

# 3. 配环境变量
copy .env.example .env
# 无 AI 密钥时把 AI_PROVIDER 改成 mock 即可全流程跑通

# 4. 建表 + 灌种子数据
pnpm prisma migrate dev
pnpm prisma db seed

# 5. 启动
pnpm dev
# 打开 http://localhost:3000
```

**种子账号**（密码均为 `123456`）：`s0001..s0005` 学生，`t0001/t0002` 教师，`a0001` 管理员。另含示例班级 `CLS001` 与任务 `fib_L2` 派发。

### 没有 Docker

- **数据库**：本地装 Postgres 16 建库 `luna_c`，改 `.env` 的 `DATABASE_URL` 指向它。
- **判题**：装 MinGW 使 `gcc` 进 PATH，`JUDGE_MODE=auto` 自动探测 docker，失败回退本地；只想走本地可设 `JUDGE_MODE=local`。

### 常用脚本

| 命令 | 作用 |
| :--- | :--- |
| `pnpm dev` | 开发服务器 :3000 |
| `pnpm build` / `pnpm start` | 生产构建 / 启动 |
| `pnpm lint` | ESLint + Prettier 门禁 |
| `pnpm judge:health` | 判题环境自检 |
| `pnpm run seed:reset` | 清表重灌种子 |
| `pnpm run test:e2e` | Playwright 端到端（需先 seed + `AI_PROVIDER=mock pnpm dev`） |

## 页面导航

| 路径 | 可见角色 | 说明 |
| :--- | :--- | :--- |
| `/` | 全部 | 鉴权分流：未登录跳 `/login`，已登录跳 `/classes` |
| `/login` | 全部 | 登录，成功后写 `luna-token` 并按角色跳落地页 |
| `/classes` | 全部 | **落地页**。学生：加入班级、按班级看任务与截止；教师：创建班级、看人数与任务数、展开任务创建器 |
| `/classes/[id]` | 教师/管理员 | 班级详情：成员列表、派发任务、成绩聚合（调 `/api/scores`） |
| `/tasks/[id]` | 全部 | 闯关页。`sequential` / `free` 两种模式，学生按解锁进度推进，教师全关可见可预览 |
| `/dashboard` | 教师/TA | 提交热力图、三轨时间线、异常放行 |
| `/admin` | ADMIN | 批量导入用户/班级 |
| `/(ide)` | 全部 | 旧版三栏 IDE 占位，任务主链路已迁移至 `/tasks/[id]` |

## API 一览

| 方法 | 路径 | 权限 | 说明 |
| :--- | :--- | :--- | :--- |
| GET | `/api/health` | 公开 | 健康检查 `{ok, ts, version}` |
| POST | `/api/auth/login` | 公开 | `{id, password}` → `{token, user}` |
| POST | `/api/auth/logout` | 需登录 | 使当前 token 失效 |
| GET | `/api/auth/me` | 需登录 | Bearer → 当前用户 |
| POST | `/api/judge/run` | 需登录 | `{language:'c', source, stdin?, limits?}` → `{status, stdout, stderr, timeMs}`，IP 限流 10/min，并发 3 |
| POST | `/api/ai/socratic` | 需登录 | Socratic 对话，5/关卡/h 限流，熔断回 mock |
| POST | `/api/checkpoint/verify` | 需登录 | 三级漏斗校验，越权 403 escalated |
| POST | `/api/checkpoint/override` | 教师/TA | 指定关卡一键放行 |
| GET | `/api/logs` | 需登录 | 时间线；`?format=csv` 导出，学生视角脱敏 |
| GET/POST | `/api/tasks` | GET 需登录 / POST 教师 | 列表；创建时按 `TaskSchema` 校验，含 AI 生成测试落盘 |
| GET/PATCH/DELETE | `/api/tasks/[id]` | 教师 | 单任务查改删 |
| GET/POST | `/api/classes` | 需登录 / 教师创建 | 班级列表与创建（返邀请码） |
| POST | `/api/classes/join` | 学生 | 邀请码加入班级 |
| GET/POST | `/api/classes/[id]/enrollments` | 教师 | 班级成员管理 |
| POST/GET | `/api/assignments` | 教师 | 派发任务到班级 |
| GET | `/api/assignments/student` | 学生 | 拉取本人被派发任务 |
| GET | `/api/scores` | 教师 | `?classId=&taskId=` 聚合得分与尝试次数 |
| POST | `/api/admin/import` | ADMIN | 批量导入 |

## 任务发布

`tasks/*.json` 为真源，`prisma Task` 仅镜像。教师经 `POST /api/tasks` 或 `TaskCreator` 创建：

- **任务级**：`intro` 简介，`checkpointMode` 取 `sequential` 或 `free`，`authorId` 自动落教师 id。
- **关卡级**：`kind: ai | code`，`intro` 与 `description` 扩展说明，`aiChain: string[]` 预设追问链，`initialCode` 起始代码，`testsPath`/`tests` 指向 `hidden_tests/*.json`，`allowAIGenerateTests: true` 时调 AI 生成 tests，校验 JSON 与落盘后再入库。
- **Gate**：仅 `ai_socratic {rubric, weight}` 与 `test_pass {tests, weight}`，`pass_threshold` 为加权阈值，`unlock.editorRegion` 控制可编辑行，`on_fail` 可配 `ai_followup` 与 `valgrind_hint`。

详见 `tasks/README.md` 与 `docs/extension-points.md`，示例看 `tasks/fib_L2.json`。

## 环境变量

| 变量 | 必填 | 说明 | 示例 |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | ✅ | Postgres 连接串 | `postgresql://postgres:postgres@localhost:5432/luna_c?schema=public` |
| `AI_PROVIDER` | — | `deepseek-api` \| `qwen-local` \| `mock` | `mock` |
| `DEEPSEEK_API_KEY` | 按需 | `AI_PROVIDER=deepseek-api` 时必填 | `sk-xxxx` |
| `QWEN_URL` | 按需 | `AI_PROVIDER=qwen-local` 时必填 | `http://localhost:8000/v1` |
| `JUDGE_MODE` | — | `auto` \| `docker` \| `local` | `auto` |
| `JUDGE_URL` | — | 远程判题预留 | `http://localhost:8080` |
| `JWT_SECRET` | ✅ | 至少 16 字符 | `change-me-to-a-long-random-string` |

无新增 env，沿用 `.env.example`。

## 扩展点

- **加任务**：写 `tasks/*.json` + `hidden_tests/*.json`，保持与 `prisma/seed.ts` 一致，见 `docs/extension-points.md`。
- **换判题 / AI / 认证**：实现对应 Provider 接口后改 env 热切换，路由零改动；Provider 文件首行 `import 'server-only'`。

## 常见问题

**`prisma migrate dev` 报 P1001**：先 `docker compose up -d db` 等 healthy 再试。**判题 CE/WARN**：跑 `pnpm judge:health` 看 docker 与本地 gcc 状态。**AI 无密钥**：`AI_PROVIDER=mock` 即可全通，连续 3 次失败自动熔断回 mock。**日志写入失败**：库没起时降级 `console.error`，不阻断判题。

## 目录结构

```
src/app/            login / classes / tasks/[id] / dashboard / admin / api/*
src/components/     ide / task / class / auth / ui
src/lib/
  providers/        judge / ai / auth 热插拔
  checkpoint/       schema + loader + evaluate + 硬锁
  judge/            harness（隐藏测试执行）
  ai/               prompt / guard / 限流熔断 / context
  logs/             logger + diff + CSV
tasks/              Gate DSL 真源
hidden_tests/       隐藏测试（永不回显 expected）
judge-lite/         docker + local Runner
prisma/             schema + seed + migrations
```

## 文档

- [扩展点：加任务 / 换 Provider / 接 IAM](docs/extension-points.md)
- [任务 Gate DSL 参考](tasks/README.md)
