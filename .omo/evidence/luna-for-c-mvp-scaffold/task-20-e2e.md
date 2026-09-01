# Task 20: 端到端冒烟与隐藏测试固化

## Date: 2026-09-01

## Deliverables

| 文件 | 说明 |
| :--- | :--- |
| `hidden_tests/fib_2.json` | 6 组用例（n=0/1/2/5/10/20），`stdin/expected/description` + `_conventions` 记录 n<0 约定；description 只描述性质 |
| `hidden_tests/linked_list_3.json` | 4 组用例（空/单节点/奇偶多节点），全部 `valgrind:true` + 输入输出格式约定 |
| `e2e/checkpoint.spec.ts` | 2 条用例：完整流程（登录→cp1→写 fib→cp2→Hand in）+ 失败提示性质/不外泄断言 |
| `playwright.config.ts` | baseURL `http://localhost:3000`、chromium、testDir `e2e`、串行、剪贴板权限 |
| `scripts/seed-reset.ts` | prisma 四表 deleteMany（外键顺序）+ `pnpm exec prisma db seed` |
| `package.json` | scripts `seed:reset` / `test:e2e`；devDeps + `playwright` / `@playwright/test` |
| `src/lib/checkpoint/evaluate.ts` | `HiddenTestsFileSchema` 增加 `valgrind?: boolean` 并透传 harness；loadHiddenTests 路径约定注释 |
| `src/lib/judge/harness.ts` | `HiddenTestCase` 增加 `valgrind?: boolean`（内存敏感标记，语义注释） |

## Verification

### 编译/静态
- ✅ `pnpm exec tsc --noEmit` exit 0
- ✅ `pnpm lint` — "No ESLint warnings or errors"
- ✅ `pnpm build` — Compiled successfully（15 页 / 12 路由，type-check 阶段覆盖 e2e + playwright.config + scripts，tsconfig include `**/*.ts`）
- ✅ `pnpm exec playwright test --list` — 2 tests collected（config 有效、spec 编译通过）

### 离线判题（无 DB，`tsx --conditions react-server`，14/14 PASS）
- `loadHiddenTests('hidden_tests/fib_2.json')` → 6 用例，首 stdin=0/expected=0，末 stdin=20/expected=6765
- `loadHiddenTests('hidden_tests/linked_list_3.json')` → 4 用例，首为空链表，全部 `valgrind===true`
- 正确 fib 通过全部 6 组隐藏测试（真实 MinGW gcc 编译+运行）
- 错误 fib（return n+1）失败提示含「输出与期望不符」「边界」，不含 55 / 6765；`JSON.stringify` 全文无期望值

### 在线 HTTP 冒烟（mock AI dev server，DB down 降级，13/13 PASS）
- T1 cp1：200，passed=true，score=1，nextCheckpointId=cp2，perGate 含 mock 固定回复（证明 mock provider）
- T2 cp2 正确实现：passed=true，perGate[0].reason 含「隐藏测试全部通过（6 组）」
- T3 cp2 错误实现：passed=false，testHint 性质描述、响应全文不含 6765
- T4 越权篡改 → 403 + tampered + violations 非空（硬锁不受 DB 影响）

### Playwright e2e 实际运行
- ✅ Chromium 1234 + headless shell + ffmpeg 已安装（`pnpm exec playwright install chromium`）
- ⚠️ **完整 e2e 未跑通：本机无 PostgreSQL**（5432 无监听、无 Windows 服务、Docker daemon 不可用）
  - 实际运行结果：Chromium 正常启动、页面加载、API 请求发出，2 条用例均在登录步骤失败，
    失败信息即设计好的提示：`登录 s0001/123456 失败（HTTP 500）——需要已 seed 的数据库（pnpm run seed:reset）`
  - 即：e2e 编译有效、配置有效、harness 正常；**运行需 live DB + server**（`AI_PROVIDER=mock`）

## 运行手册（DB 就绪后）

```bash
# 1. 数据库重置 + 种子（s0001/123456 等账号）
pnpm run seed:reset
# 2. 以 mock AI 启动服务端（绝不调用付费 AI）
#    PowerShell:
$env:AI_PROVIDER='mock'; pnpm dev
# 3. 跑 e2e
pnpm run test:e2e
```

## Key Decisions
1. **登录走 API**：MVP 无登录 UI（todo 17），`POST /api/auth/login {s0001,123456}` 换 token，
   spec 加注释说明；前端 verify 走 demo 匿名通道（body.studentId）。
2. **mock 强断言**：cp1 通过后断言 mock 固定回复「如果这块内存分配后忘了释放」出现 ——
   若服务端误用真实 AI，e2e 会失败而非静默消耗付费额度。
3. **Monaco 整文件写入 = 教师视角 + 剪贴板粘贴**：键盘逐字输入会被 autoClosingBrackets 破坏；
   Ctrl+A/Ctrl+V 粘贴免疫。教师视角关闭前端回滚；后端仍按 baseline 硬锁独立校验（1-4 行必须与模板一致）。
4. **不内置 webServer 自动拉起**：强制操作者显式以 `AI_PROVIDER=mock` 启动，避免复用真实 AI 的已运行服务。
5. **hidden test description 只描述性质**：如「边界：最小合法输入 n=0」，绝不写「直接返回 0」。
6. **n<0 约定**：未定义输入，隐藏测试不覆盖；防御性返回 -1 亦可（记录在 `_conventions`）。
7. **valgrind 字段透传**：zod schema 非 strict，未知字段会被剥离 —— 显式扩展 schema 与
   `HiddenTestCase`，保证 `valgrind:true` 被校验并保留（供未来 valgrind 执行器使用）。
8. **seed-reset 手写 .env 加载**：`tsx scripts/*.ts` 不会自动读 .env（prisma CLI 会）；
   脚本内兜底解析，外部环境变量优先。

## Gotchas
1. **TS 模板字符串里的 `\n`**：e2e 常量写 `printf("%d\\n", ...)` 才是 C 字面量 `\n`；
   写单反斜杠会把真实换行塞进 C 字符串字面量 → 必 CE（Task 13 同款坑）。
2. **cp2 顶层 reason 是「全部门通过」**：`summarizeReason` 只列失败 gate；「6 组」细节在 `perGate[0].reason`。
3. **Playwright 浏览器未随 `pnpm add` 下载**（PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 且 pnpm 11 拦截 postinstall）：
   需手动 `pnpm exec playwright install chromium`。
4. **PowerShell 5.1 无 utf8NoBOM**：临时 C 文件用 write 工具落盘再交给 gcc。

## Files Created/Modified
- `hidden_tests/fib_2.json`（重写）、`hidden_tests/linked_list_3.json`（新）
- `e2e/checkpoint.spec.ts`（新）、`playwright.config.ts`（新）、`scripts/seed-reset.ts`（新）
- `src/lib/checkpoint/evaluate.ts`、`src/lib/judge/harness.ts`（valgrind 透传 + 注释）
- `package.json`（scripts + devDeps）、`.gitignore`（playwright artifacts）
