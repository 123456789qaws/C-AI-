## 注意事项
1. 每次改动完成后(一次任务). 都必须创建一个对应的 Git commit, 以便后续追踪和回滚
2. 每次改动后(一次任务), 都必须经过测试和验证再交付
3. 间隔一定版本后推送至github : git push
4. powershall 如果难用, 可以适当用 git bash
5. 当同一指令反复执行并报错次数超过10, 暂停执行并将报错返回主会话分析
6. 别忘记如果需要, 同步更新README.md

## 项目规则 (Project Rules)
- C 判题用 `gcc -std=c11 -Wall -Wextra -O2` (judge-lite: docker gcc:13 / 本地 MinGW)
- TypeScript strict 全开; 禁 `any`、禁未使用变量 (lint 门禁: next/core-web-vitals + typescript + prettier)
- Socratic 硬规则: **NEVER output >5 行完整函数** —— 只给伪代码 / 单行提示 / 反问
- 指针题必问: 谁分配 / 谁释放 / 地址值是什么, 不给修复代码
- 段错误: 引导学生用 printf / gdb / valgrind 定位
- 判题输出只允许 JSON: `{pass, confidence, reply, reason}`
- 连续 3 次答非所问 → escalate (转教师复核)

## 硬门控 (Hard-Lock, 双校验)
- 前端: Monaco `deltaDecorations` 灰显锁定区 + `onBeforeChange` 篡改回滚 (仅 UX)
- 后端: `/api/checkpoint/verify` + `/api/submit` 独立校验 editorRegion 越权 → 403 + escalated
- 绝不只靠前端锁; 后端校验是唯一权威

## 日志 (Logging)
- 每次 verify / AI 调用必写 AiInteractionLog 全字段:
  `studentId, taskId, checkpointId, role, promptText, aiReply, codeBefore, codeAfter, codeDiff, gateResult, gateType, model, tokens, confidence, sessionId`
- 统一走 `src/lib/logs/logger.ts` 的 logInteraction(), 禁止路由内联 prisma 写日志
- DB 挂 → 降级 console.error, 绝不阻塞判题结果

## 沙箱与安全 (Sandbox / Security)
- judge 用 docker: `--rm --network=none --memory=256m --pids-limit=64 --read-only --tmpfs /tmp`
  或 local gcc 子进程 (带 wall-clock kill); 二者都绝不在 Next 进程内 eval 用户代码
- 隐藏测试 expected 不回显, 只给性质 hint (case description)
- `server-only` 守卫所有含 secret 的 provider 文件; `import 'server-only'` 必须在首行
- prompt 注入过滤: sanitizePrompt (control-char + injection pattern); 代码片段不做注入过滤 (可能是合法 C 串)
- 限流: AI 5/checkpoint/h → 429; judge 10/min/IP; 熔断: 连续 3 次失败 → mock 回退

## 目录与边界 (Stack Boundaries)
- 允许改: `src/app`, `src/components`, `src/lib/{providers,checkpoint,judge,ai,auth,logs,mock}`, `prisma`, `tasks`, `judge-lite`, `hidden_tests`, `scripts`, `e2e`
- 禁止改: `.env` (真实 secret), `node_modules`, `pgdata`, 构建产物 (`.next`, `test-results`)
- Provider 抽象热插拔 (env 切换): JudgeProvider `JUDGE_MODE=auto|docker|local`; AIProvider `AI_PROVIDER=deepseek-api|qwen-local|mock`; AuthProvider
- 任务配置真源 = `tasks/*.json` (zod 校验), prisma 只镜像; schema.ts 可客户端引用, loader.ts server-only
- Next 路由文件只允许导出 HTTP handlers + config; 辅助函数放 lib/ 或模块私有

## 工作流 (Workflow)
- 一律 `feat/*` 分支开发, 验证通过后再合并
- 改 checkpoint 需同步 `tasks/*.json` + `prisma/seed.ts` + `hidden_tests/*.json`
- 涉及内存 / 指针题附 valgrind 日志
- 每任务: commit + lint/build/test 全绿再交付 (见顶部注意事项 1/2)
- DB 迁移用 `pnpm exec prisma migrate dev`; 并发任务互相污染时只提交自己路径
