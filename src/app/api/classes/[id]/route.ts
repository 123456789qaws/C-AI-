import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireTeacher } from '@/lib/auth/require';

/** DELETE /api/classes/[id] — 教师删除班级（级联删除关联） */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = requireTeacher(req);
  if (!user) {
    return NextResponse.json({ error: 'Forbidden: TEACHER or ADMIN required' }, { status: 403 });
  }

  const { id: classId } = await params;

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

    // Cascade deletes ClassEnrollment / TaskAssignment via onDelete: Cascade
    await prisma.class.delete({ where: { id: classId } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[classes/[id] DELETE] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
