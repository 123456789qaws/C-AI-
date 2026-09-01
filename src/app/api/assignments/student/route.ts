import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireStudent } from '@/lib/auth/require';

/** GET /api/assignments/student — 学生看自己所在班级被布置的任务 */
export async function GET(req: NextRequest) {
  const user = requireStudent(req);
  if (!user) {
    return NextResponse.json({ error: 'Forbidden: STUDENT required' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const includeExpired = searchParams.get('includeExpired') === 'true';

  try {
    // Get student's class enrollments
    const enrollments = await prisma.classEnrollment.findMany({
      where: { studentId: user.id },
      select: { classId: true },
    });

    const classIds = enrollments.map((e) => e.classId);
    if (classIds.length === 0) {
      return NextResponse.json({ assignments: [] });
    }

    // Get assignments for those classes
    const where: Record<string, unknown> = { classId: { in: classIds } };
    if (!includeExpired) {
      where.deadline = { gte: new Date() };
    }

    const assignments = await prisma.taskAssignment.findMany({
      where,
      include: {
        task: { select: { id: true, title: true } },
        class: { select: { id: true, name: true, code: true } },
      },
      orderBy: { assignedAt: 'desc' },
    });

    const result = await Promise.all(
      assignments.map(async (a) => {
        let intro: string | null = null;
        let checkpointMode: string | null = null;
        try {
          const { loadTask } = await import('@/lib/checkpoint/loader');
          const t = await loadTask(a.task.id);
          intro = t.intro ?? null;
          checkpointMode = t.checkpointMode;
        } catch {
          try {
            const row = await (
              prisma.task as unknown as {
                findUnique: (
                  a: unknown
                ) => Promise<{ intro?: string | null; checkpointMode?: string } | null>;
              }
            ).findUnique({
              where: { id: a.task.id },
              select: { intro: true, checkpointMode: true } as never,
            });
            intro = row?.intro ?? null;
            checkpointMode = row?.checkpointMode ?? null;
          } catch {
            // ignore
          }
        }
        return {
          taskId: a.task.id,
          taskTitle: a.task.title,
          taskIntro: intro,
          checkpointMode,
          classId: a.class.id,
          className: a.class.name,
          classCode: a.class.code,
          deadline: a.deadline?.toISOString() ?? null,
          assignedAt: a.assignedAt.toISOString(),
        };
      })
    );

    return NextResponse.json({ assignments: result });
  } catch (err) {
    console.error('[assignments/student GET] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
