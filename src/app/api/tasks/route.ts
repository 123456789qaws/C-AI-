import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireTeacher, requireUser } from '@/lib/auth/require';
import { TaskSchema } from '@/lib/checkpoint/schema';
import { publishTask } from '@/lib/tasks/publisher';
import { listTasks } from '@/lib/checkpoint/loader';

/**
 * GET /api/tasks — list published tasks
 * - TEACHER/ADMIN: own authored + all (for now returns all; author filter optional)
 * - STUDENT: tasks assigned via TaskAssignment in student's classes + all public? spec: via assignment or all.
 * Auth required.
 */
export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const tasks = await listTasks();

    // Enrich with TaskAssignment/DB metadata (intro, assignment status) — best effort
    // For teacher: no filter; for student: annotate assigned flag via enrollments
    let assignedTaskIds: Set<string> | null = null;
    if (user.role === 'STUDENT') {
      try {
        const enrollments = await prisma.classEnrollment.findMany({
          where: { studentId: user.id },
          select: { classId: true },
        });
        const classIds = enrollments.map((e) => e.classId);
        if (classIds.length > 0) {
          const assignments = await prisma.taskAssignment.findMany({
            where: { classId: { in: classIds } },
            select: { taskId: true },
          });
          assignedTaskIds = new Set(assignments.map((a) => a.taskId));
        } else {
          assignedTaskIds = new Set();
        }
      } catch {
        // DB unavailable: fall back to no assignment filtering
        assignedTaskIds = null;
      }
    }

    const payload = tasks.map((t) => ({
      id: t.id,
      title: t.title,
      intro: t.intro ?? null,
      description: t.description ?? null,
      checkpointMode: t.checkpointMode,
      authorId: t.authorId ?? null,
      checkpoints: t.checkpoints,
      assigned: assignedTaskIds ? assignedTaskIds.has(t.id) : undefined,
    }));

    return NextResponse.json({ tasks: payload });
  } catch (err) {
    console.error('[tasks GET] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/tasks — TEACHER/ADMIN creates {id,title,intro,checkpointMode, checkpoints:[...]}
 * Body validated via TaskSchema, then publisher writes to tasks/*.json + prisma.
 * If allowAIGenerateTests per checkpoint, AI生成测试无误验证 (schema + file write).
 */
const postBodySchema = TaskSchema;

export async function POST(req: NextRequest) {
  const user = requireTeacher(req);
  if (!user)
    return NextResponse.json({ error: 'Forbidden: TEACHER or ADMIN required' }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Auto-stamp authorId if missing
  if (body && typeof body === 'object' && !('authorId' in (body as Record<string, unknown>))) {
    (body as Record<string, unknown>).authorId = user.id;
  }

  const parsed = postBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Invalid task',
        message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      },
      { status: 400 }
    );
  }

  // Validate referenced hidden_tests exist when not AI-generated (warn but not fatal: evaluate will escalate)
  // Main flow: publish via publisher (includes AI generation)
  try {
    const { task, aiGenerated } = await publishTask(parsed.data);
    return NextResponse.json({ task, aiGenerated }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Zod already handled; remaining errors are AI gen or FS/DB
    if (msg.includes('AI生成') || msg.includes('不是合法JSON') || msg.includes('格式非法')) {
      return NextResponse.json({ error: 'AI generation failed', message: msg }, { status: 422 });
    }
    console.error('[tasks POST] publish error:', err);
    return NextResponse.json({ error: 'Failed to publish task', message: msg }, { status: 500 });
  }
}
