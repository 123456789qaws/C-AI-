import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import prisma from '@/lib/db';
import { verifyToken } from '@/lib/auth/jwt';
import { redactSecrets } from '@/lib/ai/guard';
import { logInteraction } from '@/lib/logs/logger';
import { checkRateLimit } from '@/lib/ai/rateLimit';
import { loadTask } from '@/lib/checkpoint/loader';
import { checkEditorLock } from '@/lib/checkpoint/lockCheck';
import { evaluateCheckpoint, type EvaluateResult } from '@/lib/checkpoint/evaluate';
import type { Checkpoint, Task } from '@/lib/checkpoint/schema';

/**
 * POST /api/checkpoint/verify —— 后端硬锁 + 两级漏斗。
 *
 * 1. 硬锁：对比提交 code 与关卡 unlock.editorRegion 行号范围，锁定行被写入
 *    内容（或与 baseline 模板不一致）→ 403 {passed:false, escalated:true}，
 *    教师大盘可见「异常提交」。
 * 2. AI 复核：ai_socratic gate 调 AIProvider 按 rubric 判题，
 *    confidence < 0.7 → escalated（不自动过关，转教师复核）。
 * 3. test_pass：读隐藏测试 JSON → judge-lite 真编译真运行，全 AC 才过；
 *    期望值绝不回传（仅回传失败用例的性质描述）。
 *
 * 每次验证（含越权拒收）都写 AiInteractionLog（全字段）+ upsert CheckpointProgress。
 * 鉴权：Authorization Bearer（verifyToken）→ studentId；**不再允许 body.studentId 兜底**。
 * 绝不只信前端锁 —— 前端灰显可被 F12 绕过，本路由是唯一权威判定。
 */

/** 输入上限（与 judge/ai 网关对齐） */
const MAX_CODE_SIZE = 64 * 1024;
const MAX_ANSWER_SIZE = 4000;
const MAX_ID_SIZE = 128;

const verifyBodySchema = z.object({
  taskId: z.string().min(1, 'taskId is required').max(MAX_ID_SIZE),
  checkpointId: z.string().min(1, 'checkpointId is required').max(MAX_ID_SIZE),
  code: z.string().max(MAX_CODE_SIZE, `code must be <= ${MAX_CODE_SIZE} bytes`).optional(),
  studentAnswer: z.string().max(MAX_ANSWER_SIZE).optional(),
  /** 起始模板代码（可选）：提供后锁定行必须与模板一致（严格硬锁） */
  baseline: z.string().max(MAX_CODE_SIZE).optional(),
});

/** Bearer 解析（与 /api/auth/me 一致） */
function extractBearerToken(req: Request): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

function resolveAuth(req: Request): { id: string; role: string } | null {
  const token = extractBearerToken(req);
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;
  return { id: payload.id, role: payload.role };
}

function isPrivilegedRole(role: string): boolean {
  return role === 'TEACHER' || role === 'ADMIN' || role === 'TA';
}

/** 上一次该关卡提交的代码（作为本次 codeBefore，形成回放链） */
async function previousCode(
  studentId: string,
  taskId: string,
  checkpointId: string
): Promise<string | undefined> {
  try {
    const last = await prisma.aiInteractionLog.findFirst({
      where: { studentId, taskId, checkpointId, codeAfter: { not: null } },
      orderBy: { ts: 'desc' },
      select: { codeAfter: true },
    });
    return last?.codeAfter ?? undefined;
  } catch {
    return undefined;
  }
}

/** upsert CheckpointProgress：attempts+1；passed 时记录 unlockedAt（保留首次解锁时间） */
async function upsertProgress(
  ctx: { studentId: string; taskId: string; checkpointId: string },
  passed: boolean
): Promise<number> {
  const key = { studentId: ctx.studentId, taskId: ctx.taskId, checkpointId: ctx.checkpointId };
  const where = { studentId_taskId_checkpointId: key };
  try {
    const existing = await prisma.checkpointProgress.findUnique({ where });
    if (existing) {
      const row = await prisma.checkpointProgress.update({
        where,
        data: {
          attempts: existing.attempts + 1,
          passed: passed || existing.passed,
          unlockedAt: passed && !existing.unlockedAt ? new Date() : existing.unlockedAt,
        },
      });
      return row.attempts;
    }
    const row = await prisma.checkpointProgress.create({
      data: { ...key, attempts: 1, passed, unlockedAt: passed ? new Date() : null },
    });
    return row.attempts;
  } catch (err) {
    console.error(
      '[verify] CheckpointProgress 写入失败:',
      redactSecrets(err instanceof Error ? err.message : String(err))
    );
    return 0;
  }
}

function findCheckpoint(task: Task, checkpointId: string): Checkpoint | undefined {
  return task.checkpoints.find((c) => c.id === checkpointId);
}

function summarizeReason(result: EvaluateResult): string {
  const bad = result.perGate.filter((g) => !g.passed || g.escalated);
  if (bad.length === 0) return `全部门通过（score ${result.score.toFixed(2)}）`;
  return bad
    .map((g) => `${g.type}: ${g.reason}`)
    .join('；')
    .slice(0, 2000);
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = verifyBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_input',
        message: parsed.error.issues.map((i) => i.message).join('; '),
      },
      { status: 400 }
    );
  }
  const input = parsed.data;

  const auth = resolveAuth(req);
  if (!auth) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const studentId = auth.id;
  const callerRole = auth.role;
  const isTeacherCaller = isPrivilegedRole(callerRole);

  const { taskId, checkpointId } = input;

  // 1) 加载关卡定义（tasks 真源）
  let task: Task;
  try {
    task = await loadTask(taskId);
  } catch (err) {
    return NextResponse.json(
      { error: 'task_not_found', message: err instanceof Error ? err.message : String(err) },
      { status: 404 }
    );
  }
  const checkpoint = findCheckpoint(task, checkpointId);
  if (!checkpoint) {
    return NextResponse.json(
      { error: 'checkpoint_not_found', message: `任务 ${taskId} 中不存在关卡 ${checkpointId}` },
      { status: 404 }
    );
  }

  const code = input.code ?? '';
  const sessionId = randomUUID();
  const ctx = { studentId, taskId, checkpointId, sessionId };

  // 2) AI 复核限流（含 ai_socratic gate 才消耗额度，第 6 次起 429）
  if (checkpoint.gates.some((g) => g.type === 'ai_socratic')) {
    const rate = checkRateLimit(studentId, checkpointId);
    if (!rate.allowed) {
      return NextResponse.json(
        {
          error: 'rate_limited',
          retryAfterSeconds: rate.retryAfterSeconds,
          hint: '请联系教师放行',
        },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
      );
    }
  }

  // 3) 后端硬锁：锁定行（已解锁区间之外）被写入内容 → 403 + escalated
  // checkpoint 按顺序解锁（通过 cp_i 才能验证 cp_{i+1}），验证 cp_k 时第 0..k 个
  // checkpoint 的 unlock.editorRegion 全部视为已解锁区间（学生可能已写入内容）。
  // 只用当前关卡自己的区间会把前序关卡的合法编辑误判为越权（todo 12 单关卡语义，此处扩展为多关卡）。
  // free 模式：全部解锁；教师调用：全部解锁（预览）
  const currentIndex = task.checkpoints.findIndex((c) => c.id === checkpointId);
  const isFreeMode = task.checkpointMode === 'free';
  if (code.trim().length > 0) {
    const unlockedRegions: readonly [number, number][] =
      isTeacherCaller || isFreeMode
        ? task.checkpoints.map((c) => c.unlock.editorRegion)
        : task.checkpoints.slice(0, currentIndex + 1).map((c) => c.unlock.editorRegion);
    const lock = checkEditorLock(code, unlockedRegions, input.baseline);
    if (lock.tampered) {
      const codeBefore = await previousCode(studentId, taskId, checkpointId);
      await logInteraction({
        studentId: ctx.studentId,
        taskId: ctx.taskId,
        checkpointId: ctx.checkpointId,
        sessionId: ctx.sessionId,
        role: 'system',
        promptText: `硬锁校验：行 ${lock.violations.join(', ')} 越权编辑（允许区间 ${lock.regions
          .map(([s, e]) => `${s}-${e}`)
          .join(' / ')}）`,
        gateResult: 'escalated',
        gateType: 'lock',
        model: 'lock-check',
        codeBefore,
        codeAfter: code,
      });
      await upsertProgress(ctx, false);

      return NextResponse.json(
        {
          passed: false,
          escalated: true,
          tampered: true,
          reason: `检测到锁定区越权编辑（行 ${lock.violations.join(', ')}），本次提交已拒收并标记异常`,
          violations: lock.violations,
        },
        { status: 403 }
      );
    }
  }

  // 3.5) 教师全解锁预览：教师/TA/ADMIN 直接视为通过，返回全部解锁区间（不落进度）
  if (isTeacherCaller) {
    const allUnlockRegions = task.checkpoints.map((c) => c.unlock.editorRegion);
    return NextResponse.json({
      passed: true,
      score: 1,
      escalated: false,
      reason: '教师预览：全部关卡已解锁',
      perGate: [],
      nextCheckpointId: null,
      unlockRegions: allUnlockRegions,
      attempts: null,
      fullUnlock: true,
      teacherPreview: true,
    });
  }

  // 4) 两级漏斗求值：AI 复核 → test_pass 真判题
  let result: EvaluateResult;
  try {
    result = await evaluateCheckpoint(checkpoint, {
      code,
      studentAnswer: input.studentAnswer ?? '',
    });
  } catch (err) {
    console.error(
      '[verify] evaluate failed:',
      redactSecrets(err instanceof Error ? err.message : String(err))
    );
    return NextResponse.json({ error: 'evaluate_failed' }, { status: 500 });
  }

  // 5) 日志与进度落库（每次验证都全量记录；codeDiff 由 logger 统一计算）
  const codeBefore = await previousCode(studentId, taskId, checkpointId);
  for (const gate of result.perGate) {
    await logInteraction({
      studentId: ctx.studentId,
      taskId: ctx.taskId,
      checkpointId: ctx.checkpointId,
      sessionId: ctx.sessionId,
      role: gate.type === 'ai_socratic' ? 'assistant' : 'system',
      promptText: gate.promptText,
      aiReply: gate.reply,
      gateResult: gate.escalated ? 'escalated' : gate.passed ? 'passed' : 'failed',
      gateType: gate.type,
      model: gate.model ?? 'unknown',
      tokens: gate.tokens,
      confidence: gate.confidence,
      codeBefore,
      codeAfter: code.length > 0 ? code : undefined,
    });
  }
  const attempts = await upsertProgress(ctx, result.passed);

  // 6) 过关 → 提示下一关卡与解锁区间
  const next = result.passed && currentIndex >= 0 ? task.checkpoints[currentIndex + 1] : undefined;

  return NextResponse.json({
    passed: result.passed,
    score: Number(result.score.toFixed(3)),
    escalated: result.escalated,
    reason: summarizeReason(result),
    perGate: result.perGate.map((g) => ({
      type: g.type,
      weight: g.weight,
      passed: g.passed,
      escalated: g.escalated,
      confidence: g.confidence,
      reply: g.reply,
      reason: g.reason,
      error: g.error,
    })),
    ...(result.testHint !== undefined ? { testHint: result.testHint } : {}),
    nextCheckpointId: next?.id ?? null,
    unlockRegions: next ? [next.unlock.editorRegion] : [],
    attempts: attempts > 0 ? attempts : null,
  });
}
