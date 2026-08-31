# Task 14 Evidence: AIProvider 抽象与苏格拉底判题网关壳

## Date: 2026-08-31

## Deliverables

| File | Status |
|------|--------|
| src/lib/providers/ai/types.ts | ✅ AIProvider 接口 + AICompletion/AIUsage/AICompleteOptions/JudgeResult |
| src/lib/providers/ai/mock.ts | ✅ 固定 Socratic JSON（MOCK_SOCRATIC_JSON 常量），实现 AIProvider |
| src/lib/providers/ai/deepseek.ts | ✅ OpenAI 兼容 fetch，key 来自 env.DEEPSEEK_API_KEY |
| src/lib/providers/ai/qwen.ts | ✅ QWEN_URL OpenAI 兼容 fetch |
| src/lib/providers/ai/index.ts | ✅ 工厂 switch AI_PROVIDER deepseek-api / qwen-local / mock |
| src/lib/ai/prompt.ts | ✅ SocraticSystemPrompt（中文硬规则）+ buildJudgePrompt(userMsg, codeSnippet) |
| src/app/api/ai/socratic/route.ts | ✅ POST 网关壳：鉴权占位 + 限流占位 + 输入转义 + JSON.parse 降级 |

## Contract

- `AIProvider.complete(prompt, opts?): Promise<{text, usage:{tokens}}>` — 所有 provider 实现该接口。
- `POST /api/ai/socratic` body: `{checkpointId, studentAnswer, codeSnippet, history}` → 响应 `{pass, confidence, reply, reason}`。
- 系统提示词硬规则：>5 行函数禁止 / 递归问终止条件 / 指针问谁分配谁释放 / 段错误问打印地址 / 只输出判题 JSON / 连续 3 次答非所问标 escalate。
- mock provider 返回固定 Socratic JSON 字符串（确定性，供测试）。

## Verification

### 1. pnpm build

```
$ next build
  ▲ Next.js 14.2.35
  - Environments: .env

   Creating an optimized production build ...
 ✓ Compiled successfully
   Linting and checking validity of types ...
   Collecting page data ...
   Generating static pages (12/12)
 ✓ Generating static pages (12/12)
   Finalizing page optimization ...
   Collecting build traces ...

Route (app)                              Size     First Load JS
┌ ○ /                                    7.82 kB         107 kB
├ ○ /_not-found                          872 B          88.2 kB
├ ƒ /api/ai/socratic                     0 B                0 B
├ ƒ /api/auth/login                      0 B                0 B
├ ƒ /api/auth/logout                     0 B                0 B
├ ƒ /api/auth/me                         0 B                0 B
├ ○ /api/health                          0 B                0 B
├ ƒ /api/judge/run                       0 B                0 B
└ ○ /dashboard                           4.53 kB         104 kB
```

`/api/ai/socratic` 注册为动态路由（ƒ）。

### 2. pnpm lint

```
$ next lint
✔ No ESLint warnings or errors
```

### 3. Client bundle leakage check

```
Get-ChildItem -Path ".next\static" -Recurse -File |
  Select-String -Pattern "谁负责释放|递归基|硬规则|DEEPSEEK_API_KEY|QWEN_URL" -List
→ NO LEAKS - system prompt & keys absent from .next/static
```

系统提示词与 API key 均未进入客户端静态产物。

## Notes / Cross-task coordination

- `src/app/api/auth/me/route.ts` 曾导出非路由符号 `extractBearerToken` 导致 next build 类型检查失败（Next 规定 route 文件只能导出 HTTP 方法），已移除该多余 export（仅内部使用）——属 auth 并行任务文件，未纳入本任务提交。
- `pnpm-workspace.yaml` 中 `esbuild: set this to true or false` 占位符（auth 任务遗留）会令 pnpm 依赖检查失败，并行任务已自行修复为 `true`。
- `src/middleware.ts`（auth 任务文件）prettier 格式化由本任务顺手修正以打通 lint 门禁，未纳入提交。
- 限流/熔断（Task 15）与真实鉴权按要求保持占位（`RATE_LIMIT_ENABLED=false`、`AUTH_ENABLED=false` + TODO 注释），未实现。
