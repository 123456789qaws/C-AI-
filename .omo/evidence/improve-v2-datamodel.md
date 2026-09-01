# Evidence — improve-v2-datamodel: Task intro + checkpointMode + AI链/代码题

**Date:** 2026-09-02
**Scope:** prisma/schema.prisma, src/lib/checkpoint/schema.ts, tasks/*.json, prisma/seed.ts, migration

## 变更总览

- **prisma/schema.prisma Task**
  - `intro String? @db.Text` — 任务简介（对应 tasks JSON intro）
  - `checkpointMode String @default("sequential") @db.VarChar(20)` — sequential(默认)/free
  - `authorId String?` + `author User? @relation("TaskAuthor", fields:[authorId], references:[id])`
  - `User.authoredTasks Task[] @relation("TaskAuthor")` 反向关联
  - 保留 `checkpoints Json` / `hiddenTests Json` 兼容，新增列均 optional / default

- **src/lib/checkpoint/schema.ts**
  - `Checkpoint` 新增 optional：`kind?: 'ai'|'code'`、`intro?: string`、`description?: string`、`aiChain?: string[]`、`initialCode?: string`、`testsPath?: string` (alias `tests`)、`tests?: string`、`allowAIGenerateTests?: boolean`
  - `Task` 新增：`intro?: string`、`checkpointMode: z.enum(['sequential','free']).default('sequential')`、`authorId?: string`
  - 保留原有 `gates` 判别联合校验（ai_socratic / test_pass），新字段不破坏旧 JSON

- **tasks/fib_L2.json**
  - 根：`intro:"斐波那契数列定义为..."`、`checkpointMode:"sequential"`
  - cp1: `kind:"ai"`, `intro`, `aiChain:["n为0/1时返回?",...]`
  - cp2: `kind:"code"`, `initialCode:"// TODO..."`, `testsPath`+`tests:"hidden_tests/fib_2.json"`, `allowAIGenerateTests:false`

- **tasks/linked_list_reverse.json**
  - 同理：根 intro + sequential；cp1 ai + aiChain(3问含"谁分配/谁释放")；cp2 code + initialCode(三指针框架) + testsPath + allowAIGenerateTests:true

- **prisma/seed.ts**
  - checkpoints 与 tasks JSON 同步（移除已废弃 regex gate，补 kind/aiChain/initialCode 等）
  - SEED_TASKS 补 `intro`/`checkpointMode`，upsert 兼容新列

- **prisma/migrations/20260902000000_add_task_intro_mode_author/migration.sql**
  - `pnpm exec prisma migrate diff --from-schema-datamodel <old> --to-schema-datamodel prisma/schema.prisma --script` 离线生成（DB不可用）
  - 内容：`ALTER TABLE "Task" ADD COLUMN "authorId" TEXT, ADD COLUMN "checkpointMode" VARCHAR(20) NOT NULL DEFAULT 'sequential', ADD COLUMN "intro" TEXT; ALTER TABLE "Task" ADD CONSTRAINT "Task_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;`

## 验证

```bash
pnpm prisma generate  # ✔ Generated Prisma Client v5.22.0
pnpm exec tsc --noEmit # exit 0
pnpm build            # ✓ Compiled successfully (23 pages, middleware 26.9kB)
tsx TaskSchema check  # fib_L2.json PASS, linked_list_reverse.json PASS, old compat true
```

- 新字段全部 optional / default，向后兼容；`TaskSchema.parse` 旧 tasks 仍通过
- `pnpm prisma generate` 后 `Task.authorId` / `intro` / `checkpointMode` 类型可用
- `pnpm build` 全绿，无类型/ lint 阻塞

## 回滚

- `prisma/migrations/20260902000000_add_task_intro_mode_author/migration.sql` 仅加列+FK，`ON DELETE SET NULL`，回滚可 `ALTER TABLE "Task" DROP CONSTRAINT "Task_authorId_fkey"; ALTER TABLE "Task" DROP COLUMN "authorId","checkpointMode","intro";`
- zod 新字段 optional，删除即回退v1 schema
