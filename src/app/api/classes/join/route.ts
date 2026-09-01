import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db';
import { requireStudent } from '@/lib/auth/require';

const joinClassSchema = z.object({
  code: z.string().length(6, '班级邀请码必须为 6 位'),
});

/** POST /api/classes/join — 学生用 {code} 入班，upsert ClassEnrollment */
export async function POST(req: NextRequest) {
  const user = requireStudent(req);
  if (!user) {
    return NextResponse.json({ error: 'Forbidden: STUDENT required' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = joinClassSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', message: parsed.error.issues.map((i) => i.message).join('; ') },
      { status: 400 }
    );
  }

  const { code } = parsed.data;

  try {
    // Find class by code
    const classInfo = await prisma.class.findUnique({
      where: { code },
      select: { id: true, name: true, code: true, teacherId: true },
    });

    if (!classInfo) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    // Upsert enrollment
    await prisma.classEnrollment.upsert({
      where: { classId_studentId: { classId: classInfo.id, studentId: user.id } },
      update: {},
      create: { classId: classInfo.id, studentId: user.id },
    });

    return NextResponse.json({ class: classInfo });
  } catch (err) {
    console.error('[classes/join POST] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
