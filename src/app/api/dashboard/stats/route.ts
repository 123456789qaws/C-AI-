import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireTeacher } from '@/lib/auth/require';

/**
 * GET /api/dashboard/stats —— 教师看板统计（Bug3-stats）。
 *
 * 口径（class-scoped contract）：
 * - 教师范围 = prisma.class.findMany({ where:{ teacherId: user.id } }) -> classIds；
 *   TA / ADMIN 无固定授课班级，看全部班级（与 /api/classes 的 ADMIN 逻辑对齐，
 *   TA 若按 teacherId 过滤会恒为 0，不诚实）。
 * - totalStudents = classId IN classIds 的 ClassEnrollment 按 studentId 去重计数；
 *   同一学生在 2 个班只算一次，绝不用 prisma.user.count() 全局总数。
 * - totalSubmissions / avgScore = 范围内学生的 AiInteractionLog 聚合
 *  （avgScore 实为通过率 passed/total*100，与看板历史口径一致）。
 * - activeNow = ts > now-5min 窗口内有 AiInteractionLog 的去重 studentId 数
 *   （同一学生多条日志只算一次；窗口外 = 0 并由前端展示诚实空态，不编造）。
 *
 * 空库时全返回 0，前端展示「暂无数据」，绝不回退 MOCK 假数。
 */

const ONLINE_WINDOW_SEC = 300;

export async function GET(req: NextRequest) {
  const user = requireTeacher(req);
  if (!user) {
    return NextResponse.json({ error: 'Forbidden: TEACHER or ADMIN required' }, { status: 403 });
  }

  try {
    const isTeacher = user.role === 'TEACHER';
    const classes = await prisma.class.findMany({
      where: isTeacher ? { teacherId: user.id } : {},
      select: { id: true },
    });
    const classIds = classes.map((c) => c.id);

    if (classIds.length === 0) {
      return NextResponse.json({
        totalStudents: 0,
        activeNow: 0,
        avgScore: 0,
        totalSubmissions: 0,
        classCount: 0,
        onlineWindowSec: ONLINE_WINDOW_SEC,
        onlineSource: 'AiInteractionLog-ts-5min',
      });
    }

    const enrollments = await prisma.classEnrollment.findMany({
      where: { classId: { in: classIds } },
      select: { studentId: true },
    });
    const studentIds = Array.from(new Set(enrollments.map((e) => e.studentId)));

    if (studentIds.length === 0) {
      return NextResponse.json({
        totalStudents: 0,
        activeNow: 0,
        avgScore: 0,
        totalSubmissions: 0,
        classCount: classIds.length,
        onlineWindowSec: ONLINE_WINDOW_SEC,
        onlineSource: 'AiInteractionLog-ts-5min',
      });
    }

    const logs = await prisma.aiInteractionLog.findMany({
      where: { studentId: { in: studentIds } },
      select: { studentId: true, gateResult: true, ts: true },
    });

    const totalSubmissions = logs.length;
    const passed = logs.filter((l) => l.gateResult === 'passed').length;
    const avgScore = totalSubmissions > 0 ? Math.round((passed / totalSubmissions) * 100) : 0;

    const onlineSince = new Date(Date.now() - ONLINE_WINDOW_SEC * 1000);
    const onlineIds = new Set(logs.filter((l) => l.ts > onlineSince).map((l) => l.studentId));

    return NextResponse.json({
      totalStudents: studentIds.length,
      activeNow: onlineIds.size,
      avgScore,
      totalSubmissions,
      classCount: classIds.length,
      onlineWindowSec: ONLINE_WINDOW_SEC,
      onlineSource: 'AiInteractionLog-ts-5min',
    });
  } catch (err) {
    console.error('[dashboard/stats] error:', err);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
}
