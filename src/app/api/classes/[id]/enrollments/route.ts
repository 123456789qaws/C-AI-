import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireTeacher } from '@/lib/auth/require';

/** POST /api/classes/[id]/enrollments — 教师手动加学生 {studentId: 学号} */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = requireTeacher(req);
  if (!user) {
    return NextResponse.json({ error: 'Forbidden: TEACHER or ADMIN required' }, { status: 403 });
  }

  const { id: classId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const rawId = (body as { studentId?: unknown })?.studentId;
  const studentId = typeof rawId === 'string' ? rawId.trim() : '';
  if (!studentId) {
    return NextResponse.json({ error: '学号不能为空' }, { status: 400 });
  }

  try {
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

    const target = await prisma.user.findUnique({
      where: { id: studentId },
      select: { id: true, name: true, role: true },
    });
    if (!target) {
      return NextResponse.json({ error: '学生账号不存在' }, { status: 404 });
    }
    if (target.role !== 'STUDENT') {
      return NextResponse.json({ error: '该账号不是学生' }, { status: 400 });
    }

    try {
      const enrollment = await prisma.classEnrollment.create({
        data: { classId, studentId },
        select: { joinedAt: true },
      });
      console.log(`[classes/${classId}/enrollments POST] teacher ${user.id} enrolled ${studentId}`);
      return NextResponse.json({
        ok: true,
        student: {
          id: target.id,
          name: target.name,
          role: target.role,
          joinedAt: enrollment.joinedAt,
        },
      });
    } catch (err) {
      // @@unique([classId, studentId]) dup -> 409
      const code = (err as { code?: string })?.code;
      if (code === 'P2002') {
        return NextResponse.json({ error: '已在班级中' }, { status: 409 });
      }
      throw err;
    }
  } catch (err) {
    console.error('[classes/[id]/enrollments POST] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE /api/classes/[id]/enrollments — 教师踢出学生 {studentId} (body 或 ?studentId=) */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = requireTeacher(req);
  if (!user) {
    return NextResponse.json({ error: 'Forbidden: TEACHER or ADMIN required' }, { status: 403 });
  }

  const { id: classId } = await params;

  let studentId = '';
  try {
    const body: unknown = await req.json();
    const rawId = (body as { studentId?: unknown })?.studentId;
    if (typeof rawId === 'string') studentId = rawId.trim();
  } catch {
    // 无 body 时回退 query
  }
  if (!studentId) {
    studentId = (new URL(req.url).searchParams.get('studentId') ?? '').trim();
  }
  if (!studentId) {
    return NextResponse.json({ error: '学号不能为空' }, { status: 400 });
  }

  try {
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

    // 严格限定本班，避免跨班误删
    const result = await prisma.classEnrollment.deleteMany({
      where: { classId, studentId },
    });
    if (result.count === 0) {
      return NextResponse.json({ error: '该学生不在本班' }, { status: 404 });
    }
    console.log(`[classes/${classId}/enrollments DELETE] teacher ${user.id} removed ${studentId}`);
    return NextResponse.json({ ok: true, removed: studentId });
  } catch (err) {
    console.error('[classes/[id]/enrollments DELETE] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

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
