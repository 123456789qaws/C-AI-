import 'server-only';

/**
 * 后端硬锁 —— 编辑器锁定区的服务端二次校验。
 *
 * 前端 Monaco 的灰显/回滚只是体验层（F12 可绕过）；真正拒收发生在提交时：
 * verify 路由用本模块对比提交代码与关卡 `unlock.editorRegion` 行号范围，
 * 锁定行（区间外）一旦被写入内容即判定越权篡改（tampered）。
 *
 * 行号约定：1-based 闭区间 [start, end]，与 Monaco 编辑器行号一致。
 *
 * 两种校验模式：
 * 1. baseline 模式（严格，全文件提交流程）：锁定行必须与 baseline（起始模板代码）
 *    逐字符一致，任何改动都是越权；允许区间内自由编辑。
 * 2. 无 baseline（MVP 兜底，仅提交可编辑片段时）：锁定行必须为空行，
 *    区间外出现任何非空内容即越权。
 */

/** 可编辑行区间 [startLine, endLine]，1-based 闭区间。 */
export type EditorRegion = readonly [number, number];

export interface LockCheckResult {
  /** 是否越权（锁定行被写入内容/被改动） */
  tampered: boolean;
  /** 越权行号（1-based，升序） */
  violations: number[];
  /** 本次检查使用的允许区间（归一化后） */
  regions: EditorRegion[];
}

/** 归一化：单区间/区间数组 → 规范化列表（交换/钳制非法起止、丢弃无效区间）。 */
function normalizeRegions(
  allowedUnlockedLines: EditorRegion | readonly EditorRegion[]
): EditorRegion[] {
  // 运行时 [5,15] 与 [[5,15],[20,30]] 都是数组 —— 用首元素类型区分：
  // 首元素是 number → 单个区间；否则视为区间数组。
  const first = (allowedUnlockedLines as readonly unknown[])[0];
  const raw =
    Array.isArray(allowedUnlockedLines) && typeof first === 'number'
      ? [allowedUnlockedLines as unknown as EditorRegion]
      : (allowedUnlockedLines as readonly EditorRegion[]);
  const regions: EditorRegion[] = [];
  for (const region of raw) {
    const s = region[0];
    const e = region[1];
    const start = Math.max(1, Math.min(s, e));
    const end = Math.max(1, Math.max(s, e));
    if (end >= start) regions.push([start, end]);
  }
  return regions;
}

function isInRegions(line: number, regions: EditorRegion[]): boolean {
  return regions.some(([s, e]) => line >= s && line <= e);
}

/**
 * 校验提交代码是否越权编辑了锁定行。
 *
 * @param code 提交的代码（完整文件或可编辑片段）
 * @param allowedUnlockedLines 允许编辑的区间（单个或数组），1-based 闭区间
 * @param baseline 可选：起始模板代码。提供时锁定行必须与 baseline 完全一致；
 *   缺省时锁定行必须为空（MVP 兜底模式）
 */
export function checkEditorLock(
  code: string,
  allowedUnlockedLines: EditorRegion | readonly EditorRegion[],
  baseline?: string
): LockCheckResult {
  const regions = normalizeRegions(allowedUnlockedLines);
  const lines = code.split(/\r?\n/);
  const baselineLines = baseline !== undefined ? baseline.split(/\r?\n/) : undefined;

  const violations: number[] = [];
  for (let i = 1; i <= lines.length; i++) {
    if (isInRegions(i, regions)) continue; // 允许区间：自由编辑

    const line = lines[i - 1];
    if (baselineLines !== undefined) {
      // 严格模式：锁定行必须与模板逐字符一致
      const expected = i <= baselineLines.length ? baselineLines[i - 1] : '';
      if (line !== expected) violations.push(i);
    } else if (line.trim().length > 0) {
      // MVP 兜底：锁定行必须为空
      violations.push(i);
    }
  }

  return { tampered: violations.length > 0, violations, regions };
}
