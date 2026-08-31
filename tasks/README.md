# tasks — Checkpoint Gate DSL 真源

本目录下的 `*.json` 是关卡定义的**唯一真源**（single source of truth）。
数据库 `Task.checkpoints` 列在 seed 时镜像这里的内容；运行时通过
`src/lib/checkpoint/loader.ts`（`server-only`）只读加载。**前端永远不能修改
tasks**——所有关卡逻辑由后端解释执行。

## 文件结构

```
tasks/
  fib_L2.json                # 斐波那契（递归）2 个 checkpoint
  linked_list_reverse.json   # 单链表逆置 2 个 checkpoint
  README.md
hidden_tests/                # test_pass 引用的隐藏测试（todo 20 创建）
  fib_2.json
  linked_list_3.json
```

## Task 根字段

| 字段          | 类型    | 必填 | 说明                                             |
| :------------ | :------ | :--- | :----------------------------------------------- |
| `id`          | string  | ✅   | 任务 id，同时是文件名（仅字母/数字/`_`/`-`）     |
| `title`       | string  | ✅   | 任务标题                                         |
| `description` | string  | —    | 任务描述                                         |
| `checkpoints` | array   | ✅   | 至少 1 个 checkpoint，按顺序解锁                 |

## Checkpoint 字段

| 字段              | 类型   | 必填 | 说明                                                    |
| :---------------- | :----- | :--- | :------------------------------------------------------ |
| `id`              | string | ✅   | 关卡 id（如 `cp1`）                                     |
| `title`           | string | ✅   | 关卡标题                                                |
| `guide_question`  | string | ✅   | 引导问题——学生要回答/达成的目标                         |
| `gates`           | array  | ✅   | 至少 1 个 Gate；加权得分 ≥ `pass_threshold` 即过关       |
| `pass_threshold`  | number | ✅   | 0..1，加权过关阈值                                       |
| `unlock`          | object | ✅   | `editorRegion: [startLine, endLine]`（可编辑行范围），可选 `hints: string[]` |
| `on_fail`         | object | —    | 失败时的教学动作：`ai_followup?: string`（追加追问）、`valgrind_hint?: boolean`（注入内存线索） |

## Gate 类型（判别联合，`type` 决定合法字段）

| type           | 载荷字段              | 说明                                                         |
| :------------- | :-------------------- | :----------------------------------------------------------- |
| `regex`        | `rule: string`        | 对学生回答文本做正则匹配（不带 flags）                       |
| `ai_socratic`  | `rubric: string`      | LLM 判官按 rubric 评分，返回 `{pass, confidence}`            |
| `test_pass`    | `tests: string`       | 隐藏测试文件路径（相对仓库根），如 `hidden_tests/fib_2.json` |

所有 Gate 都有 `weight: number`（0..1），同一 checkpoint 的 weights
与 `pass_threshold` 共同决定过关判定（校验逻辑在 todo 12 实现）。

## 新增一个任务

1. 在 `tasks/` 下新建 `my_task.json`，文件名 = `id`（仅字母/数字/`_`/`-`）。
2. 按上方字段表编写 JSON（可复制 `fib_L2.json` 改题干）。
3. `test_pass` 引用的隐藏测试放到 `hidden_tests/`，格式：
   ```json
   { "tests": [{ "input": "0", "expected": "0" }] }
   ```
   > ⚠️ 注意：`hidden_tests/*.json` 目前由 todo 20 创建；`test_pass` 可以先引用
   > 路径，文件到位后即生效，不会阻塞本阶段。
4. 运行 `pnpm exec tsx` 调用 `loadTask('my_task')` 验证：
   `TaskSchema.parse` 失败会抛错（非法 Gate 会被 zod 拒绝）。
5. seed（`prisma/seed.ts`）如需同步到数据库，把 checkpoint 数据与
   `tasks/my_task.json` 保持一致。

## 规则

- 所有 JSON 必须通过 `src/lib/checkpoint/schema.ts` 的 zod 校验。
- `editorRegion` 结束行必须 ≥ 起始行。
- `loadTask` 拒绝含路径分隔符的 taskId（防目录穿越）。
- 前端导入 `loader.ts` 会触发 `server-only` 构建错误——任务定义不可能从浏览器修改。
