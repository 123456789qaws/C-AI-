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

    const result = assignments.map((a) => ({
      taskId: a.task.id,
      taskTitle: a.task.title,
      classId: a.class.id,
      className: a.class.name,
      classCode: a.class.code,
      deadline: a.deadline?.toISOString() ?? null,
      assignedAt: a.assignedAt.toISOString(),
    }));

    return NextResponse.json({ assignments: result });
  } catch (err) {
    console.error('[assignments/student GET] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
