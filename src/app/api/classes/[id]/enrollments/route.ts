import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireTeacher } from '@/lib/auth/require';

/** GET /api/classes/[id]/enrollments — 教师看某班学生列表（join User） */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = requireTeacher(req);
  if (!user) {
    return NextResponse.json({ error: 'Forbidden: TEACHER or ADMIN required' }, { status: 403 });
  }

  const { id: classId } = await params;

  try {
    // Verify class exists and user has access
    const classInfo = await prisma.class.findUnique({
      where: { id: classId },
      select: { id: true, teacherId: true },
    });

    if (!classInfo) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    const isAdmin = user.role === 'ADMIN';
    if (!isAdmin && classInfo.teacherId !== user.id) {
      return NextResponse.json({ error: 'Forbidden: not the class teacher' }, { status: 403 });
    }

    // Get enrollments with student info
    const enrollments = await prisma.classEnrollment.findMany({
      where: { classId },
      include: {
        student: { select: { id: true, name: true, role: true } },
      },
      orderBy: { joinedAt: 'asc' },
    });

    const students = enrollments.map((e) => ({
      id: e.student.id,
      name: e.student.name,
      role: e.student.role,
      joinedAt: e.joinedAt,
    }));

    return NextResponse.json({ students });
  } catch (err) {
    console.error('[classes/[id]/enrollments GET] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
