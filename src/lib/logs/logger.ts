import { randomUUID } from 'node:crypto';

import 'server-only';

import prisma from '@/lib/db';
import { redactSecrets } from '@/lib/ai/guard';
import { simpleLineDiff } from './diff';

/**
 * AiInteractionLog 统一写入入口（Task 18）。
 *
 * 所有交互日志（verify 三级漏斗、硬锁拒收、/api/ai/socratic 网关）都经此落库，
 * codeDiff 在此统一计算（codeBefore vs codeAfter 行级 patch），
 * sessionId 缺省随机生成，便于整轮对话/验证回放。
 *
 * 降级策略：DB 不可用时 console.error（脱敏）后吞掉错误，绝不阻塞判定结果
 * —— 判定是主链路，日志是旁路。
 */

export type GateResult = 'passed' | 'failed' | 'escalated';

export interface InteractionLogInput {
  studentId: string;
  taskId: string;
  checkpointId: string;
  /** user | assistant | system */
  role: string;
  promptText?: string | null;
  aiReply?: string | null;
  codeBefore?: string | null;
  codeAfter?: string | null;
  gateResult: GateResult;
  gateType: string;
  model: string;
  tokens?: number | null;
  confidence?: number | null;
  /** 缺省随机生成；verify 传共享 sessionId 便于整轮回放 */
  sessionId?: string;
}

export async function logInteraction(input: InteractionLogInput): Promise<void> {
  try {
    await prisma.aiInteractionLog.create({
      data: {
        studentId: input.studentId,
        taskId: input.taskId,
        checkpointId: input.checkpointId,
        sessionId: input.sessionId ?? randomUUID(),
        role: input.role,
        promptText: input.promptText ?? null,
        aiReply: input.aiReply ?? null,
        codeBefore: input.codeBefore ?? null,
        codeAfter: input.codeAfter ?? null,
        codeDiff: simpleLineDiff(input.codeBefore, input.codeAfter),
        gateResult: input.gateResult,
        gateType: input.gateType,
        model: input.model,
        tokens: input.tokens ?? null,
        confidence: input.confidence ?? null,
      },
    });
  } catch (err) {
    console.error(
      '[logs] AiInteractionLog 写入失败:',
      redactSecrets(err instanceof Error ? err.message : String(err))
    );
  }
}
