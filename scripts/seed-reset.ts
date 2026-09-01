/**
 * seed:reset —— 清空业务数据并重新灌入种子数据（todo 20 的 e2e 前置步骤）。
 *
 * 用法：pnpm run seed:reset
 *
 * 前置条件：本地 PostgreSQL 必须可达（DATABASE_URL），否则整个脚本失败退出 ——
 * 这与 e2e 一致：e2e/checkpoint.spec.ts 的登录步骤依赖已 seed 的用户表。
 *
 * 流程：
 *  1. 按外键依赖顺序清空四张业务表（先引用表后主表）；
 *  2. 通过 `prisma db seed` 复用 package.json 的 prisma.seed 配置（tsx prisma/seed.ts）。
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

import { PrismaClient } from '@prisma/client';

/**
 * tsx 直跑脚本不会自动加载 .env（prisma CLI 会）；手动兜底加载，
 * 已存在于进程环境中的变量优先（外部环境覆盖 .env）。
 */
function loadDotEnv(): void {
  const file = resolve(process.cwd(), '.env');
  if (!existsSync(file)) return;
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv();

const prisma = new PrismaClient();

/** 清空顺序敏感：先删引用表（外键指向 User/Task），再删主表。 */
async function clearAll(): Promise<void> {
  const aiLogs = await prisma.aiInteractionLog.deleteMany();
  const progresses = await prisma.checkpointProgress.deleteMany();
  const tasks = await prisma.task.deleteMany();
  const users = await prisma.user.deleteMany();
  console.log(
    `Cleared ${aiLogs.count} AI logs, ${progresses.count} checkpoint progresses, ` +
      `${tasks.count} tasks, ${users.count} users`
  );
}

async function main(): Promise<void> {
  await clearAll();
  // 复用 package.json "prisma": { "seed": "tsx prisma/seed.ts" }
  execSync('pnpm exec prisma db seed', { stdio: 'inherit' });
  console.log('seed:reset 完成：数据库已恢复为初始种子状态');
}

main()
  .catch((e) => {
    console.error('[seed:reset] 失败（数据库是否可达？）:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
