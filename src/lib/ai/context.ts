/**
 * Socratic 上下文组装 —— 把学生回答、代码片段、判题结果（可选）组合成
 * 发给模型的用户消息，并在 RE（运行时崩溃）+ 内存任务/valgrind 提示时
 * 注入「脱敏后的崩溃线索」，引导模型用苏格拉底式提问帮助学生定位问题。
 *
 * 硬约束：绝不把 valgrind 原始输出 / 完整栈回溯 / 完整修复代码传给模型或学生，
 * 只传 1-2 行的摘要（extractValgrindSummary 产出）。
 *
 * 纯函数，仅服务端使用（由 socratic route 消费）。
 */
import { buildJudgePrompt } from './prompt';

/** 判题失败上下文（AI 侧视图：字段为可空子集，与 judge 契约解耦） */
export interface JudgeFailureContext {
  status: string;
  stderr?: string;
  valgrind?: string;
}

/** checkpoint 元信息（可选） */
export interface CheckpointMeta {
  title?: string;
  /** 是否为内存专题任务（memory task） */
  memoryTask?: boolean;
}

/** buildSocraticContext 入参 */
export interface SocraticContextInput {
  studentAnswer: string;
  codeSnippet?: string;
  /** 可选：上次判题结果（status==='RE' 时可能注入崩溃线索） */
  judgeResult?: JudgeFailureContext;
  /** 可选：checkpoint 元信息 */
  checkpointMeta?: CheckpointMeta;
  /** 可选：valgrind 提示开关（前端/判题器告知疑似内存问题） */
  valgrindHint?: boolean;
  /** 可选：on_fail.ai_followup —— 教师/系统追加追问 */
  aiFollowup?: string;
}

/**
 * 从 valgrind 原始输出提取 1-2 行脱敏摘要：
 * - 「Invalid read/write of size N」（可能追加 NULL 地址提示）
 * - 「崩溃点：main (file.c:line)」
 * 找不到可识别内容时返回空串（调用方降级为通用提示）。
 */
export function extractValgrindSummary(valgrindOutput: string): string {
  if (!valgrindOutput) {
    return '';
  }

  const lines = valgrindOutput
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const errLine = lines.find((l) => /Invalid (read|write) of size \d+/.test(l));
  const locLine = lines.find((l) => /\bat\s+0x[0-9a-fA-F]+:/.test(l));
  const isNullAddr = lines.some((l) => /\bAddress\s+0x0\s+is not stack'd/.test(l));

  const parts: string[] = [];

  if (errLine) {
    let errText = errLine.replace(/^==\d+==\s*/, '').trim();
    if (isNullAddr) {
      errText += '（访问地址为 NULL，空指针）';
    }
    parts.push(errText);
  } else if (isNullAddr) {
    parts.push('运行时发生非法内存访问（访问地址为 NULL，空指针）');
  }

  if (locLine) {
    const locRest = locLine
      .replace(/^==\d+==\s*/, '')
      .replace(/\bat\s+0x[0-9a-fA-F]+:\s*/, '')
      .trim();
    if (locRest) {
      parts.push(`崩溃点：${locRest}`);
    }
  }

  return parts.slice(0, 2).join('；');
}

/**
 * 组装发给模型的学生上下文（含苏格拉底框架）。
 *
 * 触发崩溃线索注入的条件：
 *   judgeResult.status === 'RE' 且（checkpointMeta.memoryTask 为 true 或 valgrindHint 为 true 或自带 valgrind 输出）
 * 此时追加 1-2 行脱敏线索，并明确要求模型先问「指针地址是多少 / 在哪一行变成 NULL / 越界」，
 * 禁止贴出完整栈与完整修复代码。
 */
export function buildSocraticContext(input: SocraticContextInput): string {
  const parts: string[] = [];

  const isRE = input.judgeResult?.status === 'RE';
  const hasValgrind =
    typeof input.judgeResult?.valgrind === 'string' && input.judgeResult.valgrind.trim().length > 0;
  const memoryTask = input.checkpointMeta?.memoryTask === true;
  const valgrindHint = input.valgrindHint === true || hasValgrind;

  if (isRE && (memoryTask || valgrindHint)) {
    const summary = hasValgrind ? extractValgrindSummary(input.judgeResult?.valgrind ?? '') : '';
    const hint = summary || '程序在运行时崩溃（疑似空指针 / 内存越界）';
    parts.push(
      [
        `【判题线索】上次运行状态 RE（运行时崩溃）。${hint}。`,
        '请先用苏格拉底式提问引导学生定位崩溃点：先问「你打印过这个指针的地址吗？地址是多少？它在哪一行变成了 NULL / 越界？」。',
        '只允许单行线索与提问；绝不可贴出完整栈回溯或完整修复代码。',
      ].join('\n')
    );
  }

  parts.push(buildJudgePrompt(input.studentAnswer, input.codeSnippet, input.aiFollowup));

  return parts.join('\n\n');
}
