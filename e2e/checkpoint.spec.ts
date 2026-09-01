import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * 端到端冒烟（todo 20）：登录 → cp1 苏格拉底回答 → 写 fib → cp2 隐藏测试 → Hand in。
 *
 * 运行前置条件（缺一不可）：
 *  1. PostgreSQL 已启动并完成 migrate + seed：pnpm run seed:reset
 *  2. 服务端以 mock AI 启动（绝不消耗真实付费 AI）：
 *     PowerShell:  $env:AI_PROVIDER='mock'; pnpm dev
 *  3. 本地判题器可用（gcc/MinGW，JUDGE_MODE=auto 自动探测；cp2 隐藏测试真编译真运行）
 *  4. Chromium 已安装：pnpm exec playwright install chromium
 *
 * 运行：pnpm run test:e2e
 *
 * 登录说明：MVP 尚无登录 UI（todo 17 JWT 接入后补）；当前通过
 * POST /api/auth/login 以 s0001/123456 换取 token，等价于『登录 s0001/123456』。
 * 前端 verify 走 demo 匿名通道（body.studentId），登录步骤用于验证身份链路可用。
 */

const STUDENT = { id: 's0001', password: '123456' };

/**
 * cp1 回答：同时命中 regex gate（`n<=1 ... 返回`）与 mock AI 判题
 * （rubric：n<=1 直接返回 n，否则递归无限下钻导致栈溢出）。
 */
const CP1_ANSWER = 'n<=1 时直接返回 n；否则 fib 会无限递归下去，最终导致栈溢出。';

/**
 * 正确实现。整文件替换后 1-4 行必须与起始模板逐字符一致（服务端 baseline 硬锁），
 * 5-15 行位于已解锁区间（cp1+cp2 并集）可自由实现。
 * 注意：printf 里的 `\\n` 是 TS 模板字符串转义，粘贴进 Monaco 后是 C 字面量 `\n`。
 */
const CORRECT_PROGRAM = `#include <stdio.h>

/* ===== 关卡 1 · 递归边界条件 ===== */
/* cp1 通过后解锁第 5-15 行：实现 int fib(int n) */
int fib(int n) {
    if (n <= 1) return n;
    return fib(n - 1) + fib(n - 2);
}

int main() {
    int n;
    scanf("%d", &n);
    printf("%d\\n", fib(n));
    return 0;
}
`;

/**
 * 错误实现（fib 返回 n+1）：全部用例 WA，用于验证失败提示只描述性质、
 * 绝不外泄期望值。
 */
const WRONG_PROGRAM = `#include <stdio.h>

/* ===== 关卡 1 · 递归边界条件 ===== */
/* cp1 通过后解锁第 5-15 行：实现 int fib(int n) */
int fib(int n) {
    return n + 1;
}

int main() {
    int n;
    scanf("%d", &n);
    printf("%d\\n", fib(n));
    return 0;
}
`;

/** 登录 s0001/123456（API 层，UI 登录页尚未实现）。依赖已 seed 的数据库。 */
async function loginAsStudent(request: APIRequestContext): Promise<void> {
  const res = await request.post('/api/auth/login', {
    data: { id: STUDENT.id, password: STUDENT.password },
  });
  expect(
    res.ok(),
    `登录 s0001/123456 失败（HTTP ${res.status()}）——需要已 seed 的数据库（pnpm run seed:reset）`
  ).toBeTruthy();
  const body = (await res.json()) as { token?: string; user?: { id?: string } };
  expect(body.token).toBeTruthy();
  expect(body.user?.id).toBe(STUDENT.id);
}

/** 打开工作台 → 在 Luna 面板回答 cp1 引导问题 → 请求验证 → cp1 通过。 */
async function passCp1(page: Page, request: APIRequestContext): Promise<void> {
  await loginAsStudent(request);
  await page.goto('/');
  await expect(page.getByLabel('向 Luna 提问')).toBeVisible();

  // 初始引导问题是 cp1
  await expect(page.getByLabel('当前引导问题')).toHaveValue(/斐波那契递归的终止条件/);

  // 在 Luna 面板回答 cp1 引导问题
  await page.getByLabel('向 Luna 提问').fill(CP1_ANSWER);
  await page.getByRole('button', { name: '发送', exact: true }).click();

  // 请求验证 → cp1 通过（regex 命中 + mock AI pass confidence 0.9）
  await page.getByRole('button', { name: '请求验证', exact: true }).click();
  const chat = page.getByRole('log', { name: 'Luna AI 对话历史' });
  await expect(chat.getByText(/通过「递归边界条件」/)).toBeVisible();

  // 强断言：mock provider 的固定回复出现 → 证明本 e2e 用的是 mock，绝不调用付费 AI
  await expect(chat.getByText(/如果这块内存分配后忘了释放/)).toBeVisible();

  // 解锁提示 + 下一关卡引导问题已切换
  await expect(chat.getByText(/下一步关卡：递归实现与隐藏测试/)).toBeVisible();
}

/** 整文件重写 Monaco：教师视角 + 剪贴板粘贴（键盘逐字输入会被 autoClosingBrackets 破坏）。 */
async function typeFullProgram(page: Page, program: string): Promise<void> {
  // 教师视角：允许覆盖锁定区（整文件重写需要）；后端仍按 baseline 硬锁独立校验
  await page.getByLabel('教师视角 (可编辑锁定区域)').check();

  await page.evaluate(async (text) => {
    await navigator.clipboard.writeText(text);
  }, program);

  const editor = page.locator('.monaco-editor');
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Control+V');
}

test.describe('Luna C MVP 端到端冒烟（mock AI）', () => {
  test('完整流程：登录 → cp1 → 写 fib → cp2 隐藏测试 → Hand in 可用', async ({ page, request }) => {
    await passCp1(page, request);

    // 写正确递归实现（整文件替换，1-4 行保持与模板一致）
    await typeFullProgram(page, CORRECT_PROGRAM);
    await expect(page.getByLabel('当前引导问题')).toHaveValue(/写出完整的 fib 递归函数/);

    // 请求验证 → cp2 test_pass：隐藏测试真编译真运行（本地 gcc，6 组用例）
    await page.getByRole('button', { name: '请求验证', exact: true }).click();
    const chat = page.getByRole('log', { name: 'Luna AI 对话历史' });
    await expect(chat.getByText(/通过「递归实现与隐藏测试」/)).toBeVisible();

    // 全部关卡通过 → Hand in 按钮可用
    const handIn = page.getByRole('button', { name: '提交作业 (Hand in)' });
    await expect(handIn).toBeEnabled();
    await expect(chat.getByText(/可以提交作业了/)).toBeVisible();

    // 提交
    await handIn.click();
    await expect(page.getByRole('button', { name: '已提交 ✓' })).toBeVisible();
    await expect(chat.getByText(/已完成所有检查点/)).toBeVisible();
  });

  test('隐藏测试失败只提示性质（nature hint），绝不外泄期望值', async ({ page, request }) => {
    await passCp1(page, request);

    // 写错误实现（fib 返回 n+1）→ 第 1 组用例即 WA
    await typeFullProgram(page, WRONG_PROGRAM);
    await page.getByRole('button', { name: '请求验证', exact: true }).click();

    const chat = page.getByRole('log', { name: 'Luna AI 对话历史' });
    const failureBubble = chat.getByText(/未通过「递归实现与隐藏测试」/);
    await expect(failureBubble).toBeVisible();

    // 性质提示：描述失败类别（输出与期望不符/边界条件），而非给出答案
    await expect(failureBubble).toContainText('输出与期望不符');
    await expect(failureBubble).toContainText('边界条件');

    // 隐藏期望值（fib(10)=55、fib(20)=6765）绝不出现在失败提示中
    await expect(failureBubble).not.toContainText('6765');
    await expect(failureBubble).not.toContainText('55');

    // 未通过时 Hand in 仍然禁用
    await expect(page.getByRole('button', { name: '提交作业 (Hand in)' })).toBeDisabled();
  });
});
