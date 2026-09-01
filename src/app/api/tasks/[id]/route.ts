import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireUser } from '@/lib/auth/require';
import { loadTask } from '@/lib/checkpoint/loader';

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

  // Student: enrich with progress + assignment deadline
  const progress: Record<string, { passed: boolean; attempts: number }> = {};
  let assignments: { classId: string; deadline: string | null }[] = [];
  try {
    const rows = await prisma.checkpointProgress.findMany({
      where: { studentId: user.id, taskId: id },
      select: { checkpointId: true, passed: true, attempts: true },
    });
    for (const r of rows) progress[r.checkpointId] = { passed: r.passed, attempts: r.attempts };

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
  });
}
