import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db';
import { requireTeacher } from '@/lib/auth/require';

const CLASS_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const CLASS_CODE_LENGTH = 6;
const MAX_CODE_GEN_ATTEMPTS = 10;

function generateClassCode(): string {
  let code = '';
  for (let i = 0; i < CLASS_CODE_LENGTH; i++) {
    code += CLASS_CODE_CHARS[Math.floor(Math.random() * CLASS_CODE_CHARS.length)];
  }
  return code;
}

async function generateUniqueClassCode(): Promise<string> {
  for (let attempt = 0; attempt < MAX_CODE_GEN_ATTEMPTS; attempt++) {
    const code = generateClassCode();
    const existing = await prisma.class.findUnique({ where: { code } });
    if (!existing) return code;
  }
  throw new Error('Failed to generate unique class code after max attempts');
}

const createClassSchema = z.object({
  name: z.string().min(1, '班级名称不能为空').max(100),
});

/** GET /api/classes — 教师看自己班级，ADMIN 看全部 */
export async function GET(req: NextRequest) {
  const user = requireTeacher(req);
  if (!user) {
    return NextResponse.json({ error: 'Forbidden: TEACHER or ADMIN required' }, { status: 403 });
  }

  try {
    const isAdmin = user.role === 'ADMIN';
    const where = isAdmin ? {} : { teacherId: user.id };

    const classes = await prisma.class.findMany({
      where,
      include: {
        teacher: { select: { id: true, name: true } },
        _count: { select: { enrollments: true, assignments: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ classes });
  } catch (err) {
    console.error('[classes GET] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST /api/classes — 教师建班 {name}，自动生成唯一 code */
export async function POST(req: NextRequest) {
  const user = requireTeacher(req);
  if (!user) {
    return NextResponse.json({ error: 'Forbidden: TEACHER or ADMIN required' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = createClassSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', message: parsed.error.issues.map((i) => i.message).join('; ') },
      { status: 400 }
    );
  }

  const { name } = parsed.data;

  try {
    const code = await generateUniqueClassCode();
    const newClass = await prisma.class.create({
      data: {
        name,
        code,
        teacherId: user.id,
      },
      include: {
        teacher: { select: { id: true, name: true } },
        _count: { select: { enrollments: true, assignments: true } },
      },
    });

    return NextResponse.json({ class: newClass }, { status: 201 });
  } catch (err) {
    console.error('[classes POST] error:', err);
    if (err instanceof Error && err.message.includes('unique class code')) {
      return NextResponse.json({ error: 'Failed to generate unique class code' }, { status: 500 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
