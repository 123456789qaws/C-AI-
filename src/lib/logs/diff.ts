/**
 * 最小行级 diff（供 AiInteractionLog.codeDiff 使用）。
 *
 * 公共前缀/后缀裁剪 + 增删行，输出形如：
 *   @@ -2,3 +2,4 @@
 *   -int x = 1;
 *   +int x = 2;
 *   +int y = 0;
 *
 * - 无前态（before 为 null/undefined）或前后相同 → 返回 ''（不产生噪音 patch）
 * - 无重依赖（不引 diff 库），保持 ~30 行实现
 */

/** patch 输出上限（与 verify 路由 MAX_CODE_SIZE 对齐，防超长落库） */
export const MAX_PATCH_SIZE = 64 * 1024;

export function simpleLineDiff(
  before: string | null | undefined,
  after: string | null | undefined
): string {
  if (before == null || after == null || before === after) return '';
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;

  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const lines: string[] = [`@@ -${start + 1},${endA - start} +${start + 1},${endB - start} @@`];
  for (let i = start; i < endA; i++) lines.push(`-${a[i]}`);
  for (let i = start; i < endB; i++) lines.push(`+${b[i]}`);
  return lines.join('\n').slice(0, MAX_PATCH_SIZE);
}
