import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireTeacher } from '@/lib/auth/require';
import { loadTask } from '@/lib/checkpoint/loader';

/**
 * GET /api/scores?classId=<id>&taskId=<id?>
 * Aggregation: per student attempts/passed/score percent.
 * Used for class detail view.
 * TEACHER/ADMIN only; teacher must own class unless ADMIN.
 */
export async function GET(req: NextRequest) {
  const user = requireTeacher(req);
  if (!user)
    return NextResponse.json({ error: 'Forbidden: TEACHER or ADMIN required' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const classId = searchParams.get('classId');
  const taskId = searchParams.get('taskId') ?? undefined;

  if (!classId) return NextResponse.json({ error: 'classId is required' }, { status: 400 });

  try {
    const classInfo = await prisma.class.findUnique({
      where: { id: classId },
      select: { id: true, teacherId: true, name: true },
    });
    if (!classInfo) return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    const isAdmin = user.role === 'ADMIN';
    if (!isAdmin && classInfo.teacherId !== user.id) {
      return NextResponse.json({ error: 'Forbidden: not the class teacher' }, { status: 403 });
    }

    // Enrollments for class
    const enrollments = await prisma.classEnrollment.findMany({
      where: { classId },
      include: { student: { select: { id: true, name: true, role: true } } },
      orderBy: { joinedAt: 'asc' },
    });

    // Resolve target tasks
    let taskIds: string[] = [];
    if (taskId) {
      taskIds = [taskId];
    } else {
      const assignments = await prisma.taskAssignment.findMany({
        where: { classId },
        select: { taskId: true },
      });
      taskIds = assignments.map((a) => a.taskId);
    }

    // Load task defs for denominator
    const taskMeta = new Map<string, { title: string; total: number; intro: string | null }>();
    for (const tid of taskIds) {
      try {
        const t = await loadTask(tid);
        taskMeta.set(tid, { title: t.title, total: t.checkpoints.length, intro: t.intro ?? null });
      } catch {
        // fallback to DB row
        try {
          const row = await (
            prisma.task as unknown as {
              findUnique: (
                a: unknown
              ) => Promise<{ title: string; checkpoints: unknown; intro?: string | null } | null>;
            }
          ).findUnique({
            where: { id: tid },
            select: { title: true, checkpoints: true, intro: true },
          });
          if (row) {
            const cps = Array.isArray(row.checkpoints) ? (row.checkpoints as unknown[]) : [];
            taskMeta.set(tid, { title: row.title, total: cps.length, intro: row.intro ?? null });
          }
        } catch {
          taskMeta.set(tid, { title: tid, total: 0, intro: null });
        }
      }
    }

    // For each student, fetch CheckpointProgress
    const scores = await Promise.all(
      enrollments.map(async (e) => {
        const studentId = e.student.id;
        // filter progress by taskId if specified
        const where: Record<string, unknown> = { studentId };
        if (taskIds.length === 1) where.taskId = taskIds[0];
        else if (taskIds.length > 1) where.taskId = { in: taskIds };
        else {
          // no assignments
          return {
            studentId,
            studentName: e.student.name,
            tasks: [],
            totalPassed: 0,
            totalAttempts: 0,
          };
        }
        const rows = await prisma.checkpointProgress.findMany({
          where: where as never,
          select: { taskId: true, checkpointId: true, passed: true, attempts: true },
        });

        // Group by taskId
        const byTask = new Map<string, typeof rows>();
        for (const r of rows) {
          const arr = byTask.get(r.taskId) ?? [];
          arr.push(r);
          byTask.set(r.taskId, arr);
        }

        const tasks = taskIds.map((tid) => {
          const rs = byTask.get(tid) ?? [];
          const passed = rs.filter((r) => r.passed).length;
          const attempts = rs.reduce((s, r) => s + r.attempts, 0);
          const meta = taskMeta.get(tid);
          const total = meta?.total ?? 0;
          const percent = total > 0 ? Math.round((passed / total) * 100) : 0;
          return {
            taskId: tid,
            taskTitle: meta?.title ?? tid,
            intro: meta?.intro ?? null,
            totalCheckpoints: total,
            passed,
            attempts,
            percent,
            score: percent,
          };
        });

        const totalPassed = tasks.reduce((s, t) => s + t.passed, 0);
        const totalAttempts = tasks.reduce((s, t) => s + t.attempts, 0);
        const totalCheckpoints = tasks.reduce((s, t) => s + t.totalCheckpoints, 0);
        const overallPercent =
          totalCheckpoints > 0 ? Math.round((totalPassed / totalCheckpoints) * 100) : 0;

        return {
          studentId,
          studentName: e.student.name,
          tasks,
          totalPassed,
          totalAttempts,
          totalCheckpoints,
          overallPercent,
        };
      })
    );

    return NextResponse.json({ classId, className: classInfo.name, taskIds, scores });
  } catch (err) {
    console.error('[scores GET] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
