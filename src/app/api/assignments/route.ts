import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db';
import { requireTeacher } from '@/lib/auth/require';

const createAssignmentSchema = z.object({
  taskId: z.string().min(1, 'taskId is required'),
  classId: z.string().min(1, 'classId is required'),
  deadline: z.string().datetime().nullable().optional(), // ISO string or null
});

const querySchema = z.object({
  classId: z.string().optional(),
});

const deleteBodySchema = z
  .object({
    id: z.string().min(1).optional(),
    classId: z.string().min(1).optional(),
    taskId: z.string().min(1).optional(),
  })
  .refine((v) => v.id || (v.classId && v.taskId), {
    message: '需要 id 或 classId+taskId',
  });

/** POST /api/assignments — 教师布置任务 {taskId, classId, deadline?} */
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

  const parsed = createAssignmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', message: parsed.error.issues.map((i) => i.message).join('; ') },
      { status: 400 }
    );
  }

  const { taskId, classId, deadline } = parsed.data;

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

    // Verify task exists — tasks/*.json is truth, prisma.task only mirrors.
    // If the DB mirror is missing (e.g. upsert skipped while DB was down),
    // fall back to the task file and repair the mirror instead of 404.
    let task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, title: true },
    });

    if (!task) {
      try {
        const { loadTask } = await import('@/lib/checkpoint/loader');
        const fileTask = await loadTask(taskId);
        // Best-effort mirror repair so subsequent reads hit DB too.
        try {
          await (prisma.task as unknown as { upsert: (args: unknown) => Promise<unknown> }).upsert({
            where: { id: fileTask.id },
            update: {
              title: fileTask.title,
              intro: fileTask.intro ?? null,
              checkpointMode: fileTask.checkpointMode,
              checkpoints: fileTask.checkpoints as unknown as object,
            },
            create: {
              id: fileTask.id,
              title: fileTask.title,
              intro: fileTask.intro ?? null,
              checkpointMode: fileTask.checkpointMode,
              authorId: fileTask.authorId ?? user.id,
              checkpoints: fileTask.checkpoints as unknown as object,
              hiddenTests: {},
            },
          });
        } catch {
          // mirror repair is best-effort; assignment can still proceed
        }
        task = { id: fileTask.id, title: fileTask.title };
      } catch {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }
    }

    // Create or update assignment (upsert by unique composite key would need @@unique, using find+create)
    const existing = await prisma.taskAssignment.findFirst({
      where: { taskId, classId },
    });

    let assignment;
    if (existing) {
      assignment = await prisma.taskAssignment.update({
        where: { id: existing.id },
        data: {
          teacherId: user.id,
          deadline: deadline ? new Date(deadline) : null,
        },
        include: {
          task: { select: { id: true, title: true } },
          class: { select: { id: true, name: true, code: true } },
          teacher: { select: { id: true, name: true } },
        },
      });
    } else {
      assignment = await prisma.taskAssignment.create({
        data: {
          taskId,
          classId,
          teacherId: user.id,
          deadline: deadline ? new Date(deadline) : null,
        },
        include: {
          task: { select: { id: true, title: true } },
          class: { select: { id: true, name: true, code: true } },
          teacher: { select: { id: true, name: true } },
        },
      });
    }

    return NextResponse.json({ assignment }, { status: existing ? 200 : 201 });
  } catch (err) {
    console.error('[assignments POST] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** GET /api/assignments — 教师查自己布置的任务（按 classId 过滤可选） */
export async function GET(req: NextRequest) {
  const user = requireTeacher(req);
  if (!user) {
    return NextResponse.json({ error: 'Forbidden: TEACHER or ADMIN required' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const classId = searchParams.get('classId') ?? undefined;

  const parsed = querySchema.safeParse({ classId });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid query', message: parsed.error.issues.map((i) => i.message).join('; ') },
      { status: 400 }
    );
  }

  try {
    const isAdmin = user.role === 'ADMIN';
    const where: Record<string, unknown> = isAdmin ? {} : { teacherId: user.id };
    if (classId) where.classId = classId;

    const assignments = await prisma.taskAssignment.findMany({
      where,
      include: {
        task: { select: { id: true, title: true } },
        class: { select: { id: true, name: true, code: true } },
        teacher: { select: { id: true, name: true } },
      },
      orderBy: { assignedAt: 'desc' },
    });

    // Enrich with intro from task file (best-effort)
    const enriched = await Promise.all(
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
          ...a,
          task: { ...a.task, intro, checkpointMode },
        };
      })
    );

    return NextResponse.json({ assignments: enriched });
  } catch (err) {
    console.error('[assignments GET] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE /api/assignments — 教师取消派发 {id} 或 {classId, taskId} */
export async function DELETE(req: NextRequest) {
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

  const parsed = deleteBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', message: parsed.error.issues.map((i) => i.message).join('; ') },
      { status: 400 }
    );
  }

  try {
    // Resolve the target row first — never trust client-supplied scope alone.
    const row = parsed.data.id
      ? await prisma.taskAssignment.findUnique({ where: { id: parsed.data.id } })
      : await prisma.taskAssignment.findFirst({
          where: { classId: parsed.data.classId as string, taskId: parsed.data.taskId as string },
        });
    if (!row) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }

    const classInfo = await prisma.class.findUnique({
      where: { id: row.classId },
      select: { id: true, teacherId: true },
    });
    if (!classInfo) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    const isAdmin = user.role === 'ADMIN';
    if (!isAdmin && classInfo.teacherId !== user.id) {
      return NextResponse.json({ error: 'Forbidden: not the class teacher' }, { status: 403 });
    }

    // Scope by both classId+taskId so other classes' rows can never be touched.
    await prisma.taskAssignment.deleteMany({
      where: { id: row.id, classId: row.classId, taskId: row.taskId },
    });

    return NextResponse.json({ ok: true, deleted: row.id });
  } catch (err) {
    console.error('[assignments DELETE] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
