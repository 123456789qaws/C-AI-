# 扩展点指南

Luna-C 把「换判题 / 换 AI / 换认证 / 加任务」都收敛到少数几个接口和目录。改这些地方不需要动路由代码。

## 1. 新增一个任务（Gate DSL）

任务的唯一真源是 `tasks/*.json`（zod 校验，`src/lib/checkpoint/schema.ts`），数据库 `Task.checkpoints` 只是 seed 时的镜像。

1. 在 `tasks/` 新建 `my_task.json`，**文件名必须等于 `id`**（只允许字母/数字/`_`/`-`）。
2. 最小结构：

```json
{
  "id": "my_task",
  "title": "我的任务",
  "checkpoints": [
    {
      "id": "cp1",
      "title": "第一关",
      "guide_question": "引导问题：学生要回答什么",
      "gates": [
        { "type": "regex", "rule": "(边界|base\\s*case).{0,20}(返回|return)", "weight": 0.4 },
        { "type": "ai_socratic", "rubric": "回答需点出 ...", "weight": 0.6 }
      ],
      "pass_threshold": 0.7,
      "unlock": { "editorRegion": [5, 15], "hints": ["提示：先写出口"] },
      "on_fail": { "ai_followup": "如果 n=0 仍在递归，会发生什么？", "valgrind_hint": true }
    }
  ]
}
```

3. Gate 类型（判别联合，`type` 决定合法载荷）：

| type | 载荷字段 | 作用 |
| :--- | :--- | :--- |
| `regex` | `rule: string` | 对学生回答做正则匹配（无 flags），过即得分 |
| `ai_socratic` | `rubric: string` | 调 AIProvider 按 rubric 判分，返回 `{pass, confidence}`；`confidence < 0.7` → escalated 转教师复核，不计分 |
| `test_pass` | `tests: string` | 隐藏测试文件相对路径，如 `hidden_tests/my_test.json` |

   所有 gate 都有 `weight`（0..1）；某关卡 `Σ通过weight / Σweight ≥ pass_threshold` 即过关。

4. 验证：`pnpm exec tsx -e "import('./src/lib/checkpoint/loader').then(m=>m.loadTask('my_task').then(t=>console.log(t.id)))"`（需 `--conditions react-server`）。非法 JSON 会被 zod 拒绝并抛错。
5. 同步 seed：把 checkpoint 数据镜像进 `prisma/seed.ts`（保持字段一致），跑 `pnpm prisma db seed`。
6. 前端 IDE 里的任务标题/引导问题默认内联在 `CheckpointWorkspace.tsx` 的 TASK_META（MVP 占位）；正式接入用 `GET /api/tasks/:id` 后改为服务端下发。

> 参考：`tasks/fib_L2.json`、`tasks/linked_list_reverse.json`。字段全表见 [tasks/README.md](../tasks/README.md)。

## 2. 新增 / 替换判题 Provider

接口：`src/lib/providers/judge/types.ts` 的 `JudgeProvider`：

```ts
interface JudgeProvider {
  readonly name: string;
  run(req: JudgeRunRequest): Promise<JudgeResult>;
}
```

- 现有实现：`docker.ts`（gcc:13 容器，`--network=none --memory=256m --pids-limit=64 --read-only`）、`local.ts`（MinGW 子进程 + 5s kill）。
- 替换步骤：
  1. 在 `src/lib/providers/judge/` 新建 `myRunner.ts`，实现 `JudgeProvider`，首行 `import 'server-only'`。
  2. 在 `src/lib/providers/judge/index.ts` 的工厂 `getJudgeProvider()` 里按 `env.JUDGE_MODE` 分支返回新实现（或替换某个模式）。
  3. 模式值在 `src/lib/env.ts` 的 `JUDGE_MODE` zod enum 中声明（如 `'my-runner'`）。
- 硬规则：**绝不在 Next 进程内 eval/编译用户代码**。容器或子进程之外的所有方案都必须保持同样的隔离。

## 3. 替换 AI Provider

接口：`src/lib/providers/ai/types.ts` 的 `AIProvider`：

```ts
interface AIProvider {
  readonly name: string;
  complete(prompt: string, opts?: { model?: string; system?: string }): Promise<{ text: string; usage: { tokens: number } }>;
}
```

- 现有实现：`deepseek.ts`（OpenAI 兼容）、`qwen.ts`（本地端点）、`mock.ts`。
- 替换步骤：
  1. 新建 `myAi.ts`，实现 `AIProvider`，首行 `import 'server-only'`。
  2. 在 `src/lib/providers/ai/index.ts` 工厂按 `env.AI_PROVIDER` 返回。
  3. 在 `env.ts` 的 `AI_PROVIDER` enum 加新值；若有密钥需在 `env.ts` 增补字段。
- 注意：`mock` 是熔断回退目标（连续 3 次 provider 失败 → mock），别删。

## 4. 替换认证 Provider（接学校 IAM）

接口：`src/lib/auth/provider.ts` 的 `AuthProvider`：

```ts
interface AuthProvider {
  login(id: string, password: string): Promise<AuthUser | null>;
  verify(id: string): Promise<AuthUser | null>;
}
```

- 现有实现：`LocalAuthProvider`（本地 user 表 + bcrypt + JWT）。`User.passwordHash` 为 null 表示该校账号走外部 IAM。
- 接入统一身份认证（CAS / OAuth / LDAP）：
  1. 新建 `src/lib/auth/schoolIam.ts` 实现 `AuthProvider.login`：调学校认证服务换 `{id, role, name}`；`verify` 用 JWT 解出的 id 查本地镜像（或缓存）返回。
  2. 若本地没有该用户，可在 `login` 成功后 `prisma.user.upsert` 建镜像（role 按 IAM 映射：学生/教师/TA）。
  3. 把 `authProvider` 实例换成新实现。路由 `/api/auth/login`、middleware 的 JWT 校验不用改。
- 注意：`User.passwordHash` 可空就是为此设计；IAM 用户无需在 seed 里建。

## 5. 新增隐藏测试

- 位置：`hidden_tests/*.json`，被 `test_pass` gate 的 `tests` 字段引用。
- 格式：

```json
{
  "tests": [
    { "input": "0", "expected": "0", "description": "n=0 的边界", "valgrind": true }
  ]
}
```

- `description` 是失败时回传给学生的**性质提示**（如「n=0 的边界」），**永不回传 `expected`**（`src/lib/judge/harness.ts` 有防泄漏断言）。
- `valgrind: true` 的用例失败时会给 Socratic 注入内存线索（`src/lib/ai/context.ts` 会先摘要，原始 valgrind 输出不进模型）。
- 改隐藏测试属教学内容变更：同步更新 `prisma/seed.ts` 的对应 `hiddenTests` 镜像，并重跑 e2e。

## 6. 其他值得知道的扩展口

| 关注点 | 位置 | 说明 |
| :--- | :--- | :--- |
| AI 限流阈值 | `src/lib/ai/rateLimit.ts` | `AI_RATE_LIMIT = 5` 每关卡每小时 |
| 判题限流 | `src/app/api/judge/run/route.ts` | IP 10/min，p-limit 并发 3 |
| Socratic 硬规则 | `src/lib/ai/guard.ts` | >5 行函数直接替换为追问 |
| 日志字段 | `src/lib/logs/logger.ts` | 全字段统一落库，禁止路由内联写 |
| 前端锁定 UI | `src/components/ide/CheckpointWorkspace.tsx` | 灰显 + `onBeforeChange` 回滚（仅 UX，非权威） |
| 部署编排 | `docker-compose.yml` | `db`(postgres:16) + `web`；`judge-lite` 服务已注释待启用 |

## 规则速查

- `tasks/*.json`、`hidden_tests/*.json`、`prisma/seed.ts` 三者内容必须保持一致（改动 checklist）。
- 所有含密钥的 provider 文件首行 `import 'server-only'`。
- 路由文件只允许导出 HTTP handlers + config，辅助函数放 `lib/`。
- 改 checkpoint 时：`tasks/*.json` + `prisma/seed.ts` + `hidden_tests/*.json` 同步提交。
