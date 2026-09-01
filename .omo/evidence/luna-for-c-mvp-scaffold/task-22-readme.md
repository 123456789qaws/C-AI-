# Task 22: README + .env.example + 扩展点文档

### Date: 2026-09-01

### Summary
Human-onboarding docs for Luna-C:
- `README.md` (rewrite, 161 lines): 项目简介 / 架构 ASCII 图 / 技术栈 / Windows-first 快速开始（含无 Docker 回退）/ 常用脚本表 / 环境变量表 / API 一览表 / 角色流程 / 扩展点 / FAQ / 目录结构
- `.env.example`: 7 个变量全部带注释 + 示例 + 必填标注，默认 `AI_PROVIDER=mock`（无密钥可全流程演示），无真实密钥
- `docs/extension-points.md` (new): 加任务 Gate DSL 教程、换 JudgeProvider / AIProvider / AuthProvider、加隐藏测试、接学校 IAM、扩展口速查
- `tasks/README.md` 已存在（todo 11 交付物），验证通过

### Key Decisions
1. **README 中文化** - 项目文档（tasks/README.md、seed 数据、AGENTS.md）均为中文，README 保持同一语言风格，代码标识符保留英文。
2. **命令全部对照 package.json 实写** - `pnpm dev/build/start/lint/judge:health/run seed:reset/run test:e2e` + `pnpm prisma migrate dev` + `pnpm prisma db seed`，无 `npm run` 残留。
3. **.env.example 默认 AI_PROVIDER=mock** - 新人零密钥即可跑通全流程；README FAQ 注明换 deepseek 需填 key。
4. **架构图突出硬门控** - 明确标注「前端灰显仅 UX，后端 verify 是唯一权威」，呼应 AGENTS.md 硬锁双校验。
5. **无 Docker 回退单独成节** - 数据库（本地 Postgres 16）与判题（local gcc）分开说明，对应 JUDGE_MODE=auto 的探测回退。

### Verification Results
- ✅ `pnpm build` - Compiled successfully; 15 static pages + 11 routes（含全部 9 个 API 路由与 /dashboard）；Linting and checking validity of types 通过
- ✅ README 行数 161 < 200
- ✅ 路由表与 README API 一览表一致（health/auth×3/judge/ai/checkpoint×2/logs 全部在列）
- ✅ `docs/` 目录新建，`tasks/README.md` 存在

### Files Created/Modified
- README.md (rewrite)
- .env.example (rewrite)
- docs/extension-points.md (new)

### Gotchas
1. **write 工具拒绝覆盖已存在文件** - README.md 首次用 write 报 "File already exists"，需先 read 再 edit（或 edit 全量替换）。
2. **构建输出的路由表即 API 契约** - 直接以 `pnpm build` 路由表为准核对文档 API 表，避免凭记忆写错路径。
3. **psql 默认库名 luna_c** - docker-compose 里 POSTGRES_DB=luna_c 与 DATABASE_URL 的库名必须一致，README 快速开始直接用默认值零改动。

### Next Steps
- 交付后按 AGENTS.md 提交 commit；git push 按版本节奏进行。
