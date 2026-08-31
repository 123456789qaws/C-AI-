import { NextResponse } from 'next/server';

import type { Prisma } from '@prisma/client';

import prisma from '@/lib/db';
import { verifyToken } from '@/lib/auth/jwt';
import { redactSecrets } from '@/lib/ai/guard';
import { toCsv, redactStudentId } from '@/lib/logs/csv';

/**
 * GET /api/logs —— 学习轨迹回放 / 课堂数据导出（Task 18）。
 *
 * 鉴权（middleware 已挡 /api/logs/* 的 Bearer 校验，路由内再验一次为权威判定）：
 * - STUDENT：强制只看自己的记录（忽略 query.studentId 覆盖，防越权看全班）
 * - TEACHER / TA：可看全部，或按 query.studentId 过滤
 *
 * 聚合：按 (studentId, taskId) 过滤（可选），时间线 ts 升序（+id 稳定次序）。
 * 导出：?format=csv → text/csv 附件；STUDENT 视角统一脱敏 studentId
 * （纵深防御：即使未来逻辑放宽，学生也拿不到他人完整学号）。
 */

const CSV_HEADERS = [
  'ts',
  'studentId',
  'taskId',
  'checkpointId',
  'sessionId',
  'role',
  'gateResult',
  'gateType',
  'model',
  'tokens',
  'confidence',
  'promptText',
  'aiReply',
  'codeBefore',
  'codeAfter',
  'codeDiff',
] as const;

const MAX_FILTER_SIZE = 128;

/** Bearer 解析（与 /api/auth/me 一致） */
function extractBearerToken(req: Request): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const taskId =
    (url.searchParams.get('taskId') ?? '').trim().slice(0, MAX_FILTER_SIZE) || undefined;
  const studentIdParam =
    (url.searchParams.get('studentId') ?? '').trim().slice(0, MAX_FILTER_SIZE) || undefined;
  const format = (url.searchParams.get('format') ?? 'json').toLowerCase();

  const token = extractBearerToken(req);
  if (!token) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const payload = verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // 授权：学生永远只能看自己；教师/助教可看全部或按 studentId 过滤
  const isStudent = payload.role === 'STUDENT';
  const studentId = isStudent ? payload.id : studentIdParam;

  const where: Prisma.AiInteractionLogWhereInput = {};
  if (taskId) where.taskId = taskId;
  if (studentId) where.studentId = studentId;

  let rows: Awaited<ReturnType<typeof prisma.aiInteractionLog.findMany>>;
  try {
    rows = await prisma.aiInteractionLog.findMany({
      where,
      orderBy: [{ ts: 'asc' }, { id: 'asc' }],
    });
  } catch (err) {
    console.error(
      '[logs] 查询失败:',
      redactSecrets(err instanceof Error ? err.message : String(err))
    );
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  if (format === 'csv') {
    // CSV 导出：STUDENT 视角脱敏 studentId（teacher/TA 看完整值）
    const csv = toCsv(
      [...CSV_HEADERS],
      rows.map((r) => [
        r.ts.toISOString(),
        isStudent ? redactStudentId(r.studentId) : r.studentId,
        r.taskId,
        r.checkpointId,
        r.sessionId,
        r.role,
        r.gateResult,
        r.gateType,
        r.model,
        r.tokens,
        r.confidence,
        r.promptText,
        r.aiReply,
        r.codeBefore,
        r.codeAfter,
        r.codeDiff,
      ])
    );
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="ai-interaction-logs.csv"',
      },
    });
  }

  return NextResponse.json({
    count: rows.length,
    viewer: { role: payload.role, studentId: studentId ?? null },
    filters: { taskId: taskId ?? null, studentId: studentId ?? null },
    rows: rows.map((r) => ({
      id: r.id,
      ts: r.ts.toISOString(),
      studentId: r.studentId,
      taskId: r.taskId,
      checkpointId: r.checkpointId,
      sessionId: r.sessionId,
      role: r.role,
      gateResult: r.gateResult,
      gateType: r.gateType,
      model: r.model,
      tokens: r.tokens,
      confidence: r.confidence,
      promptText: r.promptText,
      aiReply: r.aiReply,
      codeBefore: r.codeBefore,
      codeAfter: r.codeAfter,
      codeDiff: r.codeDiff,
    })),
  });
}
