import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright e2e 配置（todo 20：端到端冒烟与隐藏测试固化）。
 *
 * 运行前置条件（缺一不可，详见 e2e/checkpoint.spec.ts 顶部）：
 *  1. PostgreSQL 已启动并完成 migrate + seed：pnpm run seed:reset
 *  2. 服务端以 mock AI 启动（绝不消耗真实付费 AI）：
 *     PowerShell:  $env:AI_PROVIDER='mock'; pnpm dev
 *  3. Chromium 浏览器已安装：pnpm exec playwright install chromium
 *
 * 运行：pnpm run test:e2e
 */
export default defineConfig({
  testDir: 'e2e',
  // 端到端用例共享一个本地服务端与数据库，串行执行避免相互干扰
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  timeout: 120_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    // Monaco 需要剪贴板粘贴整段代码（e2e 用 navigator.clipboard.writeText + Ctrl+V）
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // 说明：不内置 webServer 自动拉起 —— 强制由操作者显式以 AI_PROVIDER=mock 启动，
  // 避免复用某个使用真实 AI 的已运行服务（e2e 绝不调用付费 AI）。
});
