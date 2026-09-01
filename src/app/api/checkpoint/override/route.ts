import { NextResponse } from 'next/server';

import prisma from '@/lib/db';
import { verifyToken } from '@/lib/auth/jwt';

/**
 * POST /api/checkpoint/override —— 教师手动放行关卡（Task 19）。
 *
 * 鉴权：Bearer token 必须为 TEACHER 或 TA 角色，否则 403。
 * Body：{ studentId: string, taskId: string, checkpointId: string }
 * 操作：upsert CheckpointProgress → passed=true, unlockedAt=now, attempts+1
 */

function extractBearerToken(req: Request): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

export async function POST(req: Request) {
  const token = extractBearerToken(req);
  if (!token) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // 只允许 TEACHER / TA
  if (payload.role !== 'TEACHER' && payload.role !== 'TA') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const { studentId, taskId, checkpointId } = (body ?? {}) as Record<string, string>;
  if (
    typeof studentId !== 'string' ||
    studentId.trim().length === 0 ||
    typeof taskId !== 'string' ||
    taskId.trim().length === 0 ||
    typeof checkpointId !== 'string' ||
    checkpointId.trim().length === 0
  ) {
    return NextResponse.json(
      { error: 'missing_fields', hint: '需要 studentId, taskId, checkpointId' },
      { status: 400 }
    );
  }

  const sid = studentId.trim().slice(0, 128);
  const tid = taskId.trim().slice(0, 128);
  const cid = checkpointId.trim().slice(0, 128);

  try {
    const record = await prisma.checkpointProgress.upsert({
      where: {
        studentId_taskId_checkpointId: {
          studentId: sid,
          taskId: tid,
          checkpointId: cid,
        },
      },
      update: {
        passed: true,
        unlockedAt: new Date(),
        attempts: { increment: 1 },
      },
      create: {
        studentId: sid,
        taskId: tid,
        checkpointId: cid,
        passed: true,
        attempts: 1,
        unlockedAt: new Date(),
      },
    });

    return NextResponse.json({
      ok: true,
      override: {
        studentId: record.studentId,
        taskId: record.taskId,
        checkpointId: record.checkpointId,
        passed: record.passed,
        unlockedAt: record.unlockedAt?.toISOString() ?? null,
        attempts: record.attempts,
      },
    });
  } catch (err) {
    console.error('[override] upsert 失败:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
}
