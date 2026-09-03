import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireTeacher, requireUser } from '@/lib/auth/require';
import { loadTask } from '@/lib/checkpoint/loader';
import { SUBMITTED_MARKER } from '@/lib/submissions/marker';

/**
 * GET /api/tasks/[id] — single task detail
 * - TEACHER/ADMIN: returns all checkpoints unlocked (fullUnlock=true, all editorRegions)
 * - STUDENT: returns task + assignment deadline + progress per checkpoint
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = requireUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  let task;
  try {
    task = await loadTask(id);
  } catch (err) {
    return NextResponse.json(
      { error: 'Task not found', message: err instanceof Error ? err.message : String(err) },
      { status: 404 }
    );
  }

  const isTeacher = user.role === 'TEACHER' || user.role === 'ADMIN' || user.role === 'TA';

  // Full unlock for teacher view
  if (isTeacher) {
    const allUnlockRegions = task.checkpoints.map((c) => c.unlock.editorRegion);
    return NextResponse.json({
      task,
      role: user.role,
      fullUnlock: true,
      allUnlockRegions,
      checkpoints: task.checkpoints.map((c) => ({ ...c, unlocked: true })),
    });
  }

  // Student: enrich with progress + assignment deadline + submitted flag
  const progress: Record<string, { passed: boolean; attempts: number }> = {};
  let submitted = false;
  let assignments: { classId: string; deadline: string | null }[] = [];
  try {
    const rows = await prisma.checkpointProgress.findMany({
      where: { studentId: user.id, taskId: id },
      select: { checkpointId: true, passed: true, attempts: true },
    });
    for (const r of rows) {
      // SUBMITTED_MARKER 行 → 持久 Hand in 标记，非真实关卡
      if (r.checkpointId === SUBMITTED_MARKER) {
        if (r.passed) submitted = true;
        continue;
      }
      progress[r.checkpointId] = { passed: r.passed, attempts: r.attempts };
    }

    const enrollments = await prisma.classEnrollment.findMany({
      where: { studentId: user.id },
      select: { classId: true },
    });
    const classIds = enrollments.map((e) => e.classId);
    if (classIds.length > 0) {
      const assigns = await prisma.taskAssignment.findMany({
        where: { taskId: id, classId: { in: classIds } },
        select: { classId: true, deadline: true },
      });
      assignments = assigns.map((a) => ({
        classId: a.classId,
        deadline: a.deadline?.toISOString() ?? null,
      }));
    }
  } catch {
    // DB unavailable: progress stays empty
  }

  // Determine unlocks based on checkpointMode
  const unlockStates = (() => {
    if (task.checkpointMode === 'free') {
      return task.checkpoints.map((c) => ({
        checkpointId: c.id,
        unlocked: true,
        passed: progress[c.id]?.passed ?? false,
      }));
    }
    // sequential: cp0 always unlocked, cp_{i+1} unlocked if cp_i passed
    const res: { checkpointId: string; unlocked: boolean; passed: boolean }[] = [];
    let prevPassed = true;
    for (const cp of task.checkpoints) {
      const isFirst = res.length === 0;
      const unlocked = isFirst || prevPassed;
      const passed = progress[cp.id]?.passed ?? false;
      res.push({ checkpointId: cp.id, unlocked, passed });
      prevPassed = passed;
    }
    return res;
  })();

  return NextResponse.json({
    task,
    role: user.role,
    fullUnlock: false,
    checkpointMode: task.checkpointMode,
    progress,
    unlockStates,
    assignments,
    submitted,
  });
}

/**
 * DELETE /api/tasks/[id] — 删除全局任务（作者本人或 ADMIN）
 * Removes tasks/<id>.json + prisma mirror + related TaskAssignment rows.
 * Does NOT delete student CheckpointProgress / logs (audit trail preserved).
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = requireTeacher(req);
  if (!user)
    return NextResponse.json({ error: 'Forbidden: TEACHER or ADMIN required' }, { status: 403 });

  const { id } = await params;
  const taskId = id.trim();
  if (!/^[A-Za-z0-9_-]+$/.test(taskId)) {
    return NextResponse.json({ error: 'Invalid task id' }, { status: 400 });
  }

  // Ownership: author or ADMIN. tasks/*.json is truth — authorId from file, DB mirror as fallback.
  let authorId: string | null = null;
  try {
    const fileTask = await loadTask(taskId);
    authorId = fileTask.authorId ?? null;
  } catch {
    try {
      const row = await prisma.task.findUnique({
        where: { id: taskId },
        select: { authorId: true },
      });
      authorId = row?.authorId ?? null;
    } catch {
      authorId = null;
    }
  }
  if (authorId === null) {
    // Task exists nowhere — still 404 unless DB mirror says otherwise
    try {
      const row = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true } });
      if (!row) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    } catch {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
  }
  const isAdmin = user.role === 'ADMIN';
  if (!isAdmin && authorId !== null && authorId !== user.id) {
    return NextResponse.json({ error: 'Forbidden: not the task author' }, { status: 403 });
  }

  try {
    const { unlink } = await import('node:fs/promises');
    const path = (await import('node:path')).default;
    const taskPath = path.join(process.cwd(), 'tasks', `${taskId}.json`);
    // Guard: resolved path must stay inside tasks/ (no traversal)
    if (!path.resolve(taskPath).startsWith(path.resolve(process.cwd(), 'tasks'))) {
      return NextResponse.json({ error: 'Invalid task id' }, { status: 400 });
    }
    try {
      await unlink(taskPath);
    } catch {
      // File already gone — continue with DB cleanup
    }

    try {
      await prisma.taskAssignment.deleteMany({ where: { taskId } });
    } catch {
      // best-effort
    }
    try {
      await prisma.task.deleteMany({ where: { id: taskId } });
    } catch {
      // best-effort
    }

    return NextResponse.json({ ok: true, deleted: taskId });
  } catch (err) {
    console.error('[tasks DELETE] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
