/**
 * CSV 导出工具（/api/logs?format=csv）。
 *
 * - csvEscape / toCsv：RFC 4180 单元格转义（逗号、双引号、换行）
 * - redactStudentId：学生标识脱敏 —— 保首尾各 2 位，中间掩码；过短整体掩码
 */

/** 单元格转义：含逗号/双引号/换行时用双引号包裹，内部双引号翻倍 */
export function csvEscape(value: unknown): string {
  const s = value == null ? '' : String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** 表头 + 数据行 → CSV 文本（CRLF 行尾） */
export function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(','));
  }
  return lines.join('\r\n');
}

/**
 * 学生标识脱敏：保留前 2 位与后 2 位，中间替换为 ****；
 * 长度 < 6 的短标识整体掩码为 ***（避免反推）。
 */
export function redactStudentId(id: string): string {
  if (!id) return '';
  if (id.length < 6) return '***';
  return `${id.slice(0, 2)}****${id.slice(-2)}`;
}
