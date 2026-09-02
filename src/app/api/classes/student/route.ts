import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireStudent } from '@/lib/auth/require';

/** GET /api/classes/student — 学生看自己加入的班级 */
export async function GET(req: NextRequest) {
  const user = requireStudent(req);
  if (!user) {
    return NextResponse.json({ error: 'Forbidden: STUDENT required' }, { status: 403 });
  }

  try {
    const enrollments = await prisma.classEnrollment.findMany({
      where: { studentId: user.id },
      include: {
        class: {
          include: {
            teacher: { select: { id: true, name: true } },
            _count: { select: { enrollments: true, assignments: true } },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    const classes = enrollments.map((e) => ({
      ...e.class,
      joinedAt: e.joinedAt.toISOString(),
    }));

    return NextResponse.json({ classes });
  } catch (err) {
    console.error('[classes/student GET] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
