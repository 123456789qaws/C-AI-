import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import prisma from '@/lib/db';
import { requireStudent, requireTeacher } from '@/lib/auth/require';
import { loadTask } from '@/lib/checkpoint/loader';
import { logInteraction } from '@/lib/logs/logger';
import { SUBMITTED_MARKER } from '@/lib/submissions/marker';

/**
 * /api/submissions —— 提交完成闭环（Bug5-submit，零 schema 变更设计）.
 *
 * Hand in 持久化：复用 CheckpointProgress，见 @/lib/submissions/marker.
 * 审计轨迹：经 logInteraction() 写 AiInteractionLog 全字段
 * （submit: gateResult=passed/gateType=submit；reject: escalated/reject）。
 *
 * - GET    ?classId=<id>&taskId=<id?> —— 教师看本班学生提交（须拥有该班级，ADMIN 除外）
 * - POST   { taskId } —— 学生 Hand in（须全部关卡 passed，否则 400）
 * - DELETE { studentId, taskId, classId } —— 教师打回重做（删该生该任务全部进度行）
 */

const postBodySchema = z.object({
  taskId: z.string().min(1).max(128),
});

const deleteBodySchema = z.object({
  studentId: z.string().min(1).max(128),
  taskId: z.string().min(1).max(128),
  classId: z.string().min(1).max(128),
});

/* ------------------------------------------------------------------ */
/* GET: 教师审阅 —— 本班 × 已派发任务的提交状态 + 代码快照            */
/* ------------------------------------------------------------------ */

export async function GET(req: NextRequest) {
  const user = requireTeacher(req);
  if (!user)
    return NextResponse.json({ error: 'Forbidden: TEACHER or ADMIN required' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const classId = searchParams.get('classId');
  const taskIdParam = searchParams.get('taskId') ?? undefined;
  if (!classId) return NextResponse.json({ error: 'classId is required' }, { status: 400 });

  try {
    const classInfo = await prisma.class.findUnique({
      where: { id: classId },
      select: { id: true, teacherId: true, name: true },
    });
    if (!classInfo) return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    if (user.role !== 'ADMIN' && classInfo.teacherId !== user.id) {
      return NextResponse.json({ error: 'Forbidden: not the class teacher' }, { status: 403 });
    }

    const enrollments = await prisma.classEnrollment.findMany({
      where: { classId },
      include: { student: { select: { id: true, name: true } } },
      orderBy: { joinedAt: 'asc' },
    });

    const assignments = await prisma.taskAssignment.findMany({
      where: taskIdParam ? { classId, taskId: taskIdParam } : { classId },
      include: { task: { select: { id: true, title: true } } },
      orderBy: { assignedAt: 'asc' },
    });

    const studentIds = enrollments.map((e) => e.student.id);
    const taskIds = assignments.map((a) => a.taskId);
    if (studentIds.length === 0 || taskIds.length === 0) {
      return NextResponse.json({ classId, className: classInfo.name, submissions: [] });
    }

    // 关卡总数（tasks 真源优先，DB 镜像兜底）
    const totalMap = new Map<string, number>();
    for (const tid of taskIds) {
      try {
        const t = await loadTask(tid);
        totalMap.set(tid, t.checkpoints.length);
      } catch {
        const row = await prisma.task.findUnique({
          where: { id: tid },
          select: { checkpoints: true },
        });
        const cps = row && Array.isArray(row.checkpoints) ? row.checkpoints : [];
        totalMap.set(tid, cps.length);
      }
    }

    const progressRows = await prisma.checkpointProgress.findMany({
      where: { studentId: { in: studentIds }, taskId: { in: taskIds } },
      select: { studentId: true, taskId: true, checkpointId: true, passed: true, attempts: true },
    });
    const byKey = new Map<string, typeof progressRows>();
    for (const r of progressRows) {
      const k = `${r.studentId}::${r.taskId}`;
      const arr = byKey.get(k) ?? [];
      arr.push(r);
      byKey.set(k, arr);
    }

    // 每 (学生,任务) 最新代码快照：codeAfter 非空的最后一条日志
    const submissions = await Promise.all(
      enrollments.map(async (e) => {
        const tasks = await Promise.all(
          assignments.map(async (a) => {
            const tid = a.taskId;
            const rows = byKey.get(`${e.student.id}::${tid}`) ?? [];
            const real = rows.filter((r) => r.checkpointId !== SUBMITTED_MARKER);
            const passed = real.filter((r) => r.passed).length;
            const attempts = real.reduce((s, r) => s + r.attempts, 0);
            const submitted = rows.some((r) => r.checkpointId === SUBMITTED_MARKER && r.passed);
            const total = totalMap.get(tid) ?? 0;
            const status = submitted
              ? 'submitted'
              : passed > 0 || attempts > 0
                ? 'in_progress'
                : 'not_started';

            let lastCode: string | null = null;
            let lastCodeAt: string | null = null;
            try {
              const last = await prisma.aiInteractionLog.findFirst({
                where: { studentId: e.student.id, taskId: tid, codeAfter: { not: null } },
                orderBy: { ts: 'desc' },
                select: { codeAfter: true, ts: true },
              });
              lastCode = last?.codeAfter ?? null;
              lastCodeAt = last?.ts.toISOString() ?? null;
            } catch {
              // 日志旁路失败不阻断审阅
            }

            return {
              taskId: tid,
              taskTitle: a.task.title,
              totalCheckpoints: total,
              passed,
              attempts,
              submitted,
              status,
              lastCode,
              lastCodeAt,
            };
          })
        );
        return { studentId: e.student.id, studentName: e.student.name, tasks };
      })
    );

    return NextResponse.json({ classId, className: classInfo.name, submissions });
  } catch (err) {
    console.error('[submissions GET] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ */
/* POST: 学生 Hand in —— 全部关卡 passed 后写 _submitted 持久行        */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest) {
  const user = requireStudent(req);
  if (!user) return NextResponse.json({ error: 'Forbidden: STUDENT required' }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = postBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', message: 'taskId is required' },
      { status: 400 }
    );
  }
  const taskId = parsed.data.taskId.trim();

  try {
    let checkpointIds: string[];
    try {
      const task = await loadTask(taskId);
      checkpointIds = task.checkpoints.map((c) => c.id);
    } catch {
      return NextResponse.json({ error: 'task_not_found' }, { status: 404 });
    }

    const rows = await prisma.checkpointProgress.findMany({
      where: { studentId: user.id, taskId },
      select: { checkpointId: true, passed: true },
    });
    const passedSet = new Set(
      rows.filter((r) => r.passed && r.checkpointId !== SUBMITTED_MARKER).map((r) => r.checkpointId)
    );
    const allPassed = checkpointIds.length > 0 && checkpointIds.every((id) => passedSet.has(id));
    if (!allPassed) {
      return NextResponse.json(
        { error: 'not_all_passed', hint: '请先通过所有检查点后再提交' },
        { status: 400 }
      );
    }

    await prisma.checkpointProgress.upsert({
      where: {
        studentId_taskId_checkpointId: {
          studentId: user.id,
          taskId,
          checkpointId: SUBMITTED_MARKER,
        },
      },
      update: { passed: true, attempts: { increment: 1 } },
      create: {
        studentId: user.id,
        taskId,
        checkpointId: SUBMITTED_MARKER,
        passed: true,
        attempts: 1,
      },
    });

    await logInteraction({
      studentId: user.id,
      taskId,
      checkpointId: SUBMITTED_MARKER,
      role: 'system',
      promptText: `学生提交作业（Hand in）：${checkpointIds.length} 个关卡全部通过`,
      gateResult: 'passed',
      gateType: 'submit',
      model: 'submit-flow',
    });

    return NextResponse.json({ ok: true, submitted: true, taskId });
  } catch (err) {
    console.error('[submissions POST] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ */
/* DELETE: 教师打回重做 —— 删该生该任务全部进度行（含 _submitted）     */
/* ------------------------------------------------------------------ */

export async function DELETE(req: NextRequest) {
  const user = requireTeacher(req);
  if (!user)
    return NextResponse.json({ error: 'Forbidden: TEACHER or ADMIN required' }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = deleteBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', message: '需要 studentId, taskId, classId' },
      { status: 400 }
    );
  }
  const studentId = parsed.data.studentId.trim();
  const taskId = parsed.data.taskId.trim();
  const classId = parsed.data.classId.trim();

  try {
    // 班级作用域：教师须拥有该班级；学生须在班；任务须已派发给该班
    const classInfo = await prisma.class.findUnique({
      where: { id: classId },
      select: { id: true, teacherId: true },
    });
    if (!classInfo) return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    if (user.role !== 'ADMIN' && classInfo.teacherId !== user.id) {
      return NextResponse.json({ error: 'Forbidden: not the class teacher' }, { status: 403 });
    }
    const enrollment = await prisma.classEnrollment.findUnique({
      where: { classId_studentId: { classId, studentId } },
    });
    if (!enrollment) {
      return NextResponse.json({ error: 'student_not_enrolled' }, { status: 400 });
    }
    const assignment = await prisma.taskAssignment.findFirst({
      where: { classId, taskId },
      select: { id: true },
    });
    if (!assignment) {
      return NextResponse.json({ error: 'task_not_assigned' }, { status: 400 });
    }

    const deleted = await prisma.checkpointProgress.deleteMany({
      where: { studentId, taskId },
    });

    await logInteraction({
      studentId,
      taskId,
      checkpointId: SUBMITTED_MARKER,
      role: 'system',
      promptText: `教师 ${user.id} 打回重做：清除 ${deleted.count} 条进度（含提交标记），学生可重新闯关`,
      gateResult: 'escalated',
      gateType: 'reject',
      model: 'submit-flow',
    });

    return NextResponse.json({ ok: true, reset: true, cleared: deleted.count });
  } catch (err) {
    console.error('[submissions DELETE] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
