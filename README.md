# Luna-C

面向 C 语言课程的 Socratic 辅导与判题平台。学生用浏览器里的 Monaco 编辑器写 C 代码，逐关卡通过隐藏测试；AI 以苏格拉底式追问引导思考，绝不直接给出完整实现；教师可在后台查看每个人的提交轨迹、热力图与异常提交。

## 架构

```
浏览器
 ├─ Monaco 编辑器（灰显锁定区 + 篡改回滚，仅 UX）
 ├─ Luna AI 对话面板（Socratic 追问）
 └─ 教师大盘 /dashboard（热力图 + 时间线 + 放行）
        │ JSON over HTTP
        ▼
┌────────────────────── Next.js 14 (App Router) ──────────────────────┐
│  /api/health             健康检查                                    │
│  /api/auth/login|logout|me      登录 / 登出 / 当前用户               │
│  /api/judge/run          单次 C 编译运行                             │
│  /api/ai/socratic        AI 判官（限流 5/关卡/h + 熔断 + Socratic）   │
│  /api/checkpoint/verify  关卡验证（硬锁 + 正则/AI/隐藏测试三级漏斗）  │
│  /api/checkpoint/override 教师放行                                   │
│  /api/logs               交互日志时间线 + CSV                        │
└──────┬──────────────┬──────────────┬─────────────────────────────────┘
       │              │              │
       ▼              ▼              ▼
┌──────────────┐ ┌────────────┐ ┌────────────────────┐
│ judge-lite   │ │ AI Provider│ │ PostgreSQL 16      │
│ docker gcc:13│ │ deepseek   │ │ Prisma + pg adapter│
│ 或 local gcc │ │ qwen-local │ │ users / tasks /    │
│ (子进程,     │ │ mock       │ │ logs / progress    │
│ 绝不进程内   │ │ (热插拔)    │ │                    │
│ eval 用户码) │ └────────────┘ └────────────────────┘
└──────────────┘
```

**硬门控**：前端灰显只是 UX；后端 `/api/checkpoint/verify` 每次独立校验越权（锁定行被改写 → 403 + escalated），后端是唯一权威。

## 技术栈

| 层 | 选型 |
| :--- | :--- |
| 前端 | Next.js 14 App Router, React 18, Monaco Editor, Tailwind + shadcn |
| 后端 | Next.js Route Handlers, zod 校验, Prisma 5 + pg driver adapter |
| 判题 | `judge-lite`：docker gcc:13（`--network=none --memory=256m --pids-limit=64`）或本地 MinGW gcc 子进程 |
| AI | Provider 抽象：`deepseek-api` / `qwen-local` / `mock` 热插拔 |
| 数据库 | PostgreSQL 16（docker compose 一键起） |

## 快速开始（Windows）

前置：安装 [Node.js 20+](https://nodejs.org) 与 [pnpm](https://pnpm.io/)。Docker Desktop 可选（仅数据库必需时用；判题会自动回退本地 gcc）。

```powershell
# 1. 装依赖
pnpm i

# 2. 起数据库（只需 Postgres，30 秒后 healthy）
docker compose up -d db

# 3. 配置环境变量
copy .env.example .env
#    编辑 .env：默认值即可本地跑；AI 无密钥时把 AI_PROVIDER 改成 mock

# 4. 建表 + 灌入种子数据（账号见下）
pnpm prisma migrate dev
pnpm prisma db seed

# 5. 启动开发服务器
pnpm dev
```

打开 http://localhost:3000。

**种子账号**（密码均为 `123456`）：

| id | 角色 |
| :--- | :--- |
| `s0001` .. `s0005` | 学生 |
| `t0001` / `t0002` | 教师 |

### 没有 Docker 怎么办

- **数据库**：本地装 PostgreSQL 16，建库 `luna_c`，把 `.env` 的 `DATABASE_URL` 指向它。
- **判题**：无需 Docker。装 MinGW（`gcc` 进 PATH），`JUDGE_MODE=auto` 会自动探测 docker，失败则回退本地 gcc；只想用本机可直接 `JUDGE_MODE=local`。

### 常用脚本

| 命令 | 作用 |
| :--- | :--- |
| `pnpm dev` | 开发服务器（:3000） |
| `pnpm build` / `pnpm start` | 生产构建 / 启动 |
| `pnpm lint` | ESLint + Prettier 门禁 |
| `pnpm judge:health` | 判题环境自检（无 docker 时 WARN 不报错） |
| `pnpm run seed:reset` | 清 4 表并重新 seed（需数据库在线） |
| `pnpm run test:e2e` | Playwright 端到端（需先 seed + `AI_PROVIDER=mock pnpm dev`） |

## 环境变量

| 变量 | 必填 | 说明 | 示例 |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | ✅ | PostgreSQL 连接串 | `postgresql://postgres:postgres@localhost:5432/luna_c?schema=public` |
| `AI_PROVIDER` | — | AI 提供商：`deepseek-api` \| `qwen-local` \| `mock` | `mock` |
| `DEEPSEEK_API_KEY` | 按需 | `AI_PROVIDER=deepseek-api` 时必填 | `sk-xxxx` |
| `QWEN_URL` | 按需 | `AI_PROVIDER=qwen-local` 时必填，OpenAI 兼容端点 | `http://localhost:8000/v1` |
| `JUDGE_MODE` | — | 判题模式：`auto` \| `docker` \| `local` | `auto` |
| `JUDGE_URL` | 按需 | 远程判题服务地址（预留，MVP 用本地/容器） | `http://localhost:8080` |
| `JWT_SECRET` | ✅ | JWT 签名密钥，**至少 16 字符**，生产环境务必更换 | `change-me-to-a-long-random-string` |

## API 一览

| 方法 | 路径 | 说明 |
| :--- | :--- | :--- |
| GET | `/api/health` | 健康检查 `{ok, ts, version}` |
| POST | `/api/auth/login` | `{id, password}` → `{token, user}` |
| POST | `/api/auth/logout` | 使当前 token 失效 |
| GET | `/api/auth/me` | Bearer token → 当前用户 |
| POST | `/api/judge/run` | `{language:'c', source, stdin?, limits?}` → `{status, stdout, stderr, timeMs, memoryKb}` |
| POST | `/api/ai/socratic` | 与 AI 判官对话（限流 5/关卡/h，熔断后回退 mock） |
| POST | `/api/checkpoint/verify` | 关卡验证（详见下节流程）；越权 → 403 escalated |
| POST | `/api/checkpoint/override` | 教师/TA 放行指定关卡（学生 403） |
| GET | `/api/logs` | 交互日志时间线；`?format=csv` 导出（学生视角 studentId 脱敏） |

## 角色与流程

- **学生**：登录后在 IDE 看到任务模板，锁定区灰显。cp1 答对引导问题（regex + AI 双重判定）解锁 `[5,15]` 行，cp2 写完整实现跑隐藏测试后解锁 `[16,30]`，全部过关才可 Hand in。卡住时 AI 只反问、不给完整代码（>5 行函数会被网关拦截替换）。
- **教师**：/dashboard 查看提交热力图、3 轨时间线（代码 diff / AI 对话 / 关卡判定），对疑似误判的关卡一键放行，导出 CSV。
- **TA**：同教师（可放行、可看全量日志）。

## 扩展点

- **加任务**：在 `tasks/*.json` 写 Gate DSL（`regex` / `ai_socratic` / `test_pass`），隐藏测试放 `hidden_tests/*.json`。详见 [tasks/README.md](tasks/README.md) 与 [docs/extension-points.md](docs/extension-points.md)。
- **换判题 / AI / 认证**：实现对应 Provider 接口后改环境变量热切换，路由零改动。

## 常见问题

**`prisma migrate dev` 报 P1001**：数据库没起。先 `docker compose up -d db` 等 healthy，再重试。

**判题总返回 WARN 或 CE**：docker daemon 不可达时自动回退本地 gcc；本地没有 gcc 则 CE。跑 `pnpm judge:health` 看环境自检。

**AI 报错 / 没密钥**：`.env` 里 `AI_PROVIDER=mock`，返回固定 Socratic 回复，流程可全通。连续 3 次 provider 失败会自动熔断回 mock。

**日志里全是 `AiInteractionLog 写入失败`**：数据库没起导致降级，判题结果不受影响；起库后即恢复。

## 目录结构

```
src/
  app/api/*          路由（只允许 HTTP handlers）
  components/        IDE / LunaPanel / 教师大盘
  lib/
    providers/       judge / ai / auth 三组 Provider 抽象
    checkpoint/      Gate DSL 校验 + 加载 + 评估 + 硬锁
    ai/              提示词 / 限流 / 熔断 / Socratic 硬规则
    logs/            统一日志写入 / diff / CSV
tasks/               关卡真源（Gate DSL JSON）
hidden_tests/        隐藏测试（期望值永不回显）
judge-lite/          判题 runner（docker / local）
```

## 文档

- [扩展点：加任务 / 换 Provider / 接学校 IAM](docs/extension-points.md)
- [任务 Gate DSL 参考](tasks/README.md)
