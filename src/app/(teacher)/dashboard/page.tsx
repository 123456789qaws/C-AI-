'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/* ============================================================
 * 演示数据（DB 不可用时的 fallback）
 * ============================================================ */

const MOCK_HEAT_DATA = [
  { taskId: 'task-1', taskName: 'Hello World', avgScore: 92, submissions: 45, passRate: 0.98 },
  { taskId: 'task-2', taskName: '变量与类型', avgScore: 85, submissions: 42, passRate: 0.93 },
  { taskId: 'task-3', taskName: '条件判断', avgScore: 78, submissions: 40, passRate: 0.85 },
  { taskId: 'task-4', taskName: '循环结构', avgScore: 72, submissions: 38, passRate: 0.79 },
  { taskId: 'task-5', taskName: '数组基础', avgScore: 68, submissions: 35, passRate: 0.71 },
  { taskId: 'task-6', taskName: '函数定义', avgScore: 65, submissions: 33, passRate: 0.67 },
  { taskId: 'task-7', taskName: '指针入门', avgScore: 58, submissions: 30, passRate: 0.57 },
  { taskId: 'task-8', taskName: '结构体', avgScore: 55, submissions: 28, passRate: 0.54 },
];

const MOCK_TIMELINE = [
  { time: '09:15', student: '张三', task: '指针入门', action: '提交代码', status: '通过' },
  { time: '09:18', student: '李四', task: '循环结构', action: '提交代码', status: '失败' },
  { time: '09:22', student: '王五', task: '数组基础', action: '提交代码', status: '通过' },
  { time: '09:25', student: '赵六', task: '函数定义', action: '开始编码', status: '进行中' },
  { time: '09:28', student: '钱七', task: '条件判断', action: '提交代码', status: '通过' },
  { time: '09:30', student: '孙八', task: 'Hello World', action: '提交代码', status: '通过' },
  { time: '09:33', student: '周九', task: '结构体', action: '开始编码', status: '进行中' },
  { time: '09:35', student: '吴十', task: '变量与类型', action: '提交代码', status: '通过' },
];

const MOCK_STATS = {
  totalStudents: 45,
  activeNow: 12,
  avgScore: 71.6,
  totalSubmissions: 291,
};

/* ============================================================
 * 热力图行（从 /api/logs 聚合得出）
 * ============================================================ */

interface HeatRow {
  taskId: string;
  submissions: number;
  passed: number;
  failed: number;
  escalated: number;
  passRate: number;
  escalatedRate: number;
}

/* ============================================================
 * 时间线条目
 * ============================================================ */

interface LogEntry {
  id: string;
  ts: string;
  studentId: string;
  taskId: string;
  checkpointId: string;
  role: string;
  gateResult: string;
  gateType: string;
  codeDiff: string | null;
  promptText: string | null;
  aiReply: string | null;
}

/* ============================================================
 * 辅助函数
 * ============================================================ */

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('luna-token');
}

function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function getHeatColor(passRate: number) {
  if (passRate >= 0.9) return 'bg-green-500';
  if (passRate >= 0.7) return 'bg-yellow-500';
  if (passRate >= 0.5) return 'bg-orange-500';
  return 'bg-red-500';
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function gateBadge(result: string) {
  switch (result) {
    case 'passed':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
    case 'failed':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    case 'escalated':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
    default:
      return 'bg-secondary text-secondary-foreground';
  }
}

function gateLabel(result: string) {
  switch (result) {
    case 'passed':
      return '通过';
    case 'failed':
      return '失败';
    case 'escalated':
      return '待审';
    default:
      return result;
  }
}

/* ============================================================
 * 从日志聚合热力图数据
 * ============================================================ */

function aggregateHeat(rows: LogEntry[]): HeatRow[] {
  const map = new Map<
    string,
    { submissions: number; passed: number; failed: number; escalated: number }
  >();

  for (const r of rows) {
    const key = r.taskId;
    if (!map.has(key)) {
      map.set(key, { submissions: 0, passed: 0, failed: 0, escalated: 0 });
    }
    const agg = map.get(key)!;
    agg.submissions += 1;
    if (r.gateResult === 'passed') agg.passed += 1;
    else if (r.gateResult === 'failed') agg.failed += 1;
    else if (r.gateResult === 'escalated') agg.escalated += 1;
  }

  return Array.from(map.entries())
    .map(([taskId, a]) => ({
      taskId,
      submissions: a.submissions,
      passed: a.passed,
      failed: a.failed,
      escalated: a.escalated,
      passRate: a.submissions > 0 ? a.passed / a.submissions : 0,
      escalatedRate: a.submissions > 0 ? a.escalated / a.submissions : 0,
    }))
    .sort((a, b) => b.submissions - a.submissions);
}

/* ============================================================
 * 教师看板主组件
 * ============================================================ */

export default function TeacherDashboard() {
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsSource, setLogsSource] = useState<'api' | 'mock'>('mock');
  const [overriding, setOverriding] = useState<string | null>(null);
  const [overridden, setOverridden] = useState<Set<string>>(new Set());
  const [csvLoading, setCsvLoading] = useState(false);

  /* —— 班级管理 —— */
  interface ClassItem {
    id: string;
    name: string;
    code: string;
    teacherId: string;
    teacher?: { id: string; name: string } | null;
    _count?: { enrollments: number; assignments: number };
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- scaffolded for future use
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [newClassName, setNewClassName] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- scaffolded for future use
  const [classCreating, setClassCreating] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- scaffolded for future use
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- scaffolded for future use
  const [enrolledStudents, setEnrolledStudents] = useState<
    Array<{ id: string; name: string; role: string; joinedAt: string }>
  >([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- scaffolded for future use
  const [enrollmentsLoading, setEnrollmentsLoading] = useState(false);

  /* —— 任务布置 —— */
  interface AssignmentItem {
    id: string;
    taskId: string;
    task?: { id: string; title: string } | null;
    classId: string;
    class?: { id: string; name: string; code: string } | null;
    deadline: string | null;
    assignedAt: string;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- scaffolded for future use
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [assignTaskId, setAssignTaskId] = useState('');
  const [assignClassId, setAssignClassId] = useState('');
  const [assignDeadline, setAssignDeadline] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- scaffolded for future use
  const [assignLoading, setAssignLoading] = useState(false);

  /* —— Step 1: 鉴权 —— */
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setRole('UNAUTHENTICATED');
      setLoading(false);
      return;
    }

    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        if (!r.ok) throw new Error('auth failed');
        return r.json();
      })
      .then((data) => {
        setRole(data.user?.role ?? 'UNKNOWN');
      })
      .catch(() => {
        setRole('UNAUTHENTICATED');
      })
      .finally(() => setLoading(false));
  }, []);

  /* —— Step 2: 拉取日志 —— */
  useEffect(() => {
    if (!role || role === 'STUDENT' || role === 'UNAUTHENTICATED') return;

    fetch('/api/logs', { headers: authHeaders() })
      .then((r) => {
        if (!r.ok) throw new Error('logs fetch failed');
        return r.json();
      })
      .then((data) => {
        if (Array.isArray(data.rows) && data.rows.length > 0) {
          setLogs(data.rows);
          setLogsSource('api');
        } else {
          setLogsSource('mock');
        }
      })
      .catch(() => {
        setLogsSource('mock');
      });
  }, [role]);

  /* —— 拉取班级列表 —— */
  useEffect(() => {
    if (!role || role === 'STUDENT' || role === 'UNAUTHENTICATED') return;

    fetch('/api/classes', { headers: authHeaders() })
      .then((r) => {
        if (!r.ok) throw new Error('classes fetch failed');
        return r.json();
      })
      .then((data) => {
        setClasses(data.classes ?? []);
      })
      .catch(() => {
        setClasses([]);
      });
  }, [role]);

  /* —— 拉取任务布置列表 —— */
  useEffect(() => {
    if (!role || role === 'STUDENT' || role === 'UNAUTHENTICATED') return;

    fetch('/api/assignments', { headers: authHeaders() })
      .then((r) => {
        if (!r.ok) throw new Error('assignments fetch failed');
        return r.json();
      })
      .then((data) => {
        setAssignments(data.assignments ?? []);
      })
      .catch(() => {
        setAssignments([]);
      });
  }, [role]);

  /* —— 创建班级 —— */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- scaffolded for future use
  const handleCreateClass = useCallback(async () => {
    if (!newClassName.trim()) return;
    setClassCreating(true);
    try {
      const res = await fetch('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ name: newClassName.trim() }),
      });
      if (res.ok) {
        setNewClassName('');
        // Refresh classes list
        const refreshRes = await fetch('/api/classes', { headers: authHeaders() });
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          setClasses(data.classes ?? []);
        }
      }
    } catch {
      console.error('[dashboard] create class failed');
    } finally {
      setClassCreating(false);
    }
  }, [newClassName]);

  /* —— 查看班级学生 —— */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- scaffolded for future use
  const handleViewEnrollments = useCallback(async (classId: string) => {
    setSelectedClassId(classId);
    setEnrollmentsLoading(true);
    try {
      const res = await fetch(`/api/classes/${classId}/enrollments`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setEnrolledStudents(data.students ?? []);
      }
    } catch {
      console.error('[dashboard] fetch enrollments failed');
    } finally {
      setEnrollmentsLoading(false);
    }
  }, []);

  /* —— 布置任务 —— */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- scaffolded for future use
  const handleAssignTask = useCallback(async () => {
    if (!assignTaskId || !assignClassId) return;
    setAssignLoading(true);
    try {
      const res = await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          taskId: assignTaskId,
          classId: assignClassId,
          deadline: assignDeadline ? new Date(assignDeadline).toISOString() : null,
        }),
      });
      if (res.ok) {
        setAssignTaskId('');
        setAssignClassId('');
        setAssignDeadline('');
        // Refresh assignments
        const refreshRes = await fetch('/api/assignments', { headers: authHeaders() });
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          setAssignments(data.assignments ?? []);
        }
      }
    } catch {
      console.error('[dashboard] assign task failed');
    } finally {
      setAssignLoading(false);
    }
  }, [assignTaskId, assignClassId, assignDeadline]);

  /* —— 计算热力图 —— */
  const heatData = useMemo(() => {
    if (logsSource === 'mock') return MOCK_HEAT_DATA;
    const aggregated = aggregateHeat(logs);
    // 补充 taskName：如果 taskId 格式为 "task-N"，返回对应的中文名
    const taskNames: Record<string, string> = {};
    MOCK_HEAT_DATA.forEach((m) => {
      taskNames[m.taskId] = m.taskName;
    });
    return aggregated.map((h) => ({
      taskId: h.taskId,
      taskName: taskNames[h.taskId] ?? h.taskId,
      avgScore: 0, // 从日志中无法精确计算均分，用 0 表示无数据
      submissions: h.submissions,
      passRate: h.passRate,
    }));
  }, [logs, logsSource]);

  /* —— 统计卡片 —— */
  const stats = useMemo(() => {
    if (logsSource === 'mock') return MOCK_STATS;
    const uniqueStudents = new Set(logs.map((r) => r.studentId));
    const passed = logs.filter((r) => r.gateResult === 'passed').length;
    const total = logs.length;
    return {
      totalStudents: uniqueStudents.size || MOCK_STATS.totalStudents,
      activeNow: MOCK_STATS.activeNow, // 无在线检测，保留演示值
      avgScore: total > 0 ? Math.round((passed / total) * 100) : MOCK_STATS.avgScore,
      totalSubmissions: total,
    };
  }, [logs, logsSource]);

  /* —— CSV 导出 —— */
  const handleExportCSV = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setCsvLoading(true);
    try {
      const res = await fetch('/api/logs?format=csv', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('CSV export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `teacher-dashboard-${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[dashboard] CSV 导出失败:', err);
    } finally {
      setCsvLoading(false);
    }
  }, []);

  /* —— Override 放行 —— */
  const handleOverride = useCallback(
    async (studentId: string, taskId: string, checkpointId: string) => {
      const token = getToken();
      if (!token) return;
      const key = `${studentId}:${taskId}:${checkpointId}`;
      setOverriding(key);
      try {
        const res = await fetch('/api/checkpoint/override', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ studentId, taskId, checkpointId }),
        });
        if (res.ok) {
          setOverridden((prev) => new Set(prev).add(key));
        } else {
          const data = await res.json().catch(() => ({}));
          console.error('[dashboard] override 失败:', data);
        }
      } catch (err) {
        console.error('[dashboard] override 请求失败:', err);
      } finally {
        setOverriding(null);
      }
    },
    []
  );

  /* —— Loading —— */
  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">加载中...</p>
      </div>
    );
  }

  /* —— 无权限 / 未登录 —— */
  if (role === 'STUDENT') {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Card className="max-w-sm w-full">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <svg
              className="size-12 text-muted-foreground opacity-50"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <p className="text-base font-medium text-foreground">无权限</p>
            <p className="text-sm text-muted-foreground text-center">
              教师大盘仅供教师与助教访问。如果您是学生，请返回编码界面。
            </p>
            <Button variant="outline" size="sm" onClick={() => (window.location.href = '/')}>
              返回首页
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (role === 'UNAUTHENTICATED') {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Card className="max-w-sm w-full">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <p className="text-base font-medium text-foreground">请先登录</p>
            <p className="text-sm text-muted-foreground text-center">
              您需要登录教师账号才能访问看板。
            </p>
            <Button variant="outline" size="sm" onClick={() => (window.location.href = '/')}>
              前往登录
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* 左侧导航 */}
      <aside className="flex-shrink-0 w-64 border-r border-border bg-card hidden lg:block">
        <nav className="p-4 space-y-1" aria-label="教师看板导航">
          <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            教师看板
          </div>
          <a
            href="#overview"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-primary bg-primary/10"
            aria-current="page"
          >
            <svg
              className="size-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            概览
          </a>
          <a
            href="#students"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <svg
              className="size-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            学生列表
          </a>
          <a
            href="#tasks"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <svg
              className="size-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            任务管理
          </a>
          <a
            href="#analytics"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <svg
              className="size-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            数据分析
          </a>
        </nav>
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 min-w-0 overflow-y-auto bg-background p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* 头部 */}
          <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">教师看板</h1>
              <p className="text-sm text-muted-foreground mt-1">
                实时监控学生学习进度与代码提交情况
                {logsSource === 'mock' && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                    演示数据
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={csvLoading}>
                <svg
                  className="size-4 mr-2"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                {csvLoading ? '导出中...' : '导出 CSV'}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
                <svg
                  className="size-4 mr-2"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                </svg>
                刷新
              </Button>
            </div>
          </header>

          {/* 统计卡片 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card size="sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">总学生数</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">{stats.totalStudents}</div>
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">在线人数</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">{stats.activeNow}</div>
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">平均通过率</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">
                  {stats.avgScore}
                  <span className="text-lg text-muted-foreground ml-1">%</span>
                </div>
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">总提交数</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">{stats.totalSubmissions}</div>
              </CardContent>
            </Card>
          </div>

          {/* ====== 班级管理 ====== */}
          <section id="classes" aria-labelledby="classes-title">
            <h2 id="classes-title" className="text-lg font-semibold text-foreground mb-4">
              班级管理
            </h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {/* 创建班级 */}
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label
                        htmlFor="new-class-name"
                        className="mb-1 block text-xs font-medium text-muted-foreground"
                      >
                        班级名称
                      </label>
                      <input
                        id="new-class-name"
                        type="text"
                        value={newClassName}
                        onChange={(e) => setNewClassName(e.target.value)}
                        placeholder="输入班级名称..."
                        className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
                      />
                    </div>
                    <Button
                      size="sm"
                      disabled={classCreating || !newClassName.trim()}
                      onClick={handleCreateClass}
                    >
                      {classCreating ? '创建中...' : '创建班级'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* 班级列表 */}
              <Card>
                <CardContent className="pt-4">
                  <div className="max-h-[240px] overflow-y-auto space-y-2">
                    {classes.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">暂无班级</p>
                    ) : (
                      classes.map((c) => (
                        <div
                          key={c.id}
                          className={`flex items-center justify-between rounded-lg border px-3 py-2 transition-colors ${
                            selectedClassId === c.id
                              ? 'border-primary bg-primary/5'
                              : 'border-border/50 hover:bg-muted/50'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-foreground truncate">
                              {c.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              <span className="font-mono">{c.code}</span>
                              {c._count && (
                                <span className="ml-2">
                                  {c._count.enrollments}人 · {c._count.assignments}任务
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => handleViewEnrollments(c.id)}
                            >
                              名单
                            </Button>
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => {
                                window.location.href = `/classes/${c.id}`;
                              }}
                            >
                              详情
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 学生名单弹出 */}
            {selectedClassId && (
              <Card className="mt-4">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      学生名单 — {classes.find((c) => c.id === selectedClassId)?.name}
                    </CardTitle>
                    <Button variant="ghost" size="xs" onClick={() => setSelectedClassId(null)}>
                      关闭
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {enrollmentsLoading ? (
                    <p className="text-sm text-muted-foreground">加载中...</p>
                  ) : enrolledStudents.length === 0 ? (
                    <p className="text-sm text-muted-foreground">暂无学生加入</p>
                  ) : (
                    <div className="overflow-x-auto max-h-[200px] overflow-y-auto">
                      <table className="w-full text-sm" role="table">
                        <thead className="sticky top-0 bg-card">
                          <tr className="border-b border-border">
                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                              学号
                            </th>
                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                              姓名
                            </th>
                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                              加入时间
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {enrolledStudents.map((s) => (
                            <tr key={s.id} className="border-b border-border/50">
                              <td className="px-3 py-2 font-mono text-foreground">{s.id}</td>
                              <td className="px-3 py-2 text-foreground">{s.name}</td>
                              <td className="px-3 py-2 text-muted-foreground">
                                {new Date(s.joinedAt).toLocaleDateString('zh-CN')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </section>

          {/* ====== 任务布置 ====== */}
          <section id="assignments" aria-labelledby="assignments-title">
            <h2 id="assignments-title" className="text-lg font-semibold text-foreground mb-4">
              任务布置
            </h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {/* 布置表单 */}
              <Card>
                <CardContent className="pt-4">
                  <div className="space-y-3">
                    <div>
                      <label
                        htmlFor="assign-task"
                        className="mb-1 block text-xs font-medium text-muted-foreground"
                      >
                        任务
                      </label>
                      <select
                        id="assign-task"
                        value={assignTaskId}
                        onChange={(e) => setAssignTaskId(e.target.value)}
                        className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
                      >
                        <option value="">选择任务...</option>
                        <option value="fib_L2">fib_L2 (递归 / Fibonacci)</option>
                        <option value="linked_list_reverse">linked_list_reverse (链表反转)</option>
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor="assign-class"
                        className="mb-1 block text-xs font-medium text-muted-foreground"
                      >
                        班级
                      </label>
                      <select
                        id="assign-class"
                        value={assignClassId}
                        onChange={(e) => setAssignClassId(e.target.value)}
                        className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
                      >
                        <option value="">选择班级...</option>
                        {classes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.code})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor="assign-deadline"
                        className="mb-1 block text-xs font-medium text-muted-foreground"
                      >
                        截止时间 (可选)
                      </label>
                      <input
                        id="assign-deadline"
                        type="datetime-local"
                        value={assignDeadline}
                        onChange={(e) => setAssignDeadline(e.target.value)}
                        className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
                      />
                    </div>
                    <Button
                      size="sm"
                      disabled={assignLoading || !assignTaskId || !assignClassId}
                      onClick={handleAssignTask}
                    >
                      {assignLoading ? '布置中...' : '布置任务'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* 已布置任务列表 */}
              <Card>
                <CardContent className="pt-4">
                  <div className="max-h-[240px] overflow-y-auto space-y-2">
                    {assignments.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">暂无布置任务</p>
                    ) : (
                      assignments.map((a) => (
                        <div
                          key={a.id}
                          className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-foreground truncate">
                              {a.task?.title ?? a.taskId}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {a.class?.name ?? a.classId}
                              {a.deadline && (
                                <span className="ml-2">
                                  截止: {new Date(a.deadline).toLocaleDateString('zh-CN')}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* 热力图 */}
          <section id="heatmap" aria-labelledby="heatmap-title">
            <div className="flex items-center justify-between mb-4">
              <h2 id="heatmap-title" className="text-lg font-semibold text-foreground">
                任务热力图
              </h2>
              <span className="text-xs text-muted-foreground">
                按通过率着色：绿≥90% 黄≥70% 橙≥50% 红&lt;50%
              </span>
            </div>
            <Card>
              <CardContent className="p-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" role="table">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                          任务
                        </th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                          提交数
                        </th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                          通过率
                        </th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                          热力
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {heatData.map((item) => (
                        <tr
                          key={item.taskId}
                          className="border-b border-border/50 hover:bg-muted/50"
                        >
                          <td className="px-4 py-3 font-medium text-foreground">{item.taskName}</td>
                          <td className="px-4 py-3 text-muted-foreground">{item.submissions}</td>
                          <td className="px-4 py-3 text-foreground">
                            {(item.passRate * 100).toFixed(1)}%
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div
                                className={`h-4 w-24 rounded border ${getHeatColor(item.passRate)}`}
                                style={{ width: `${Math.max(item.passRate * 100, 4)}%` }}
                                role="img"
                                aria-label={`${item.taskName} 通过率 ${(item.passRate * 100).toFixed(1)}%`}
                              />
                              <span className="text-xs text-muted-foreground w-16 text-right">
                                {(item.passRate * 100).toFixed(0)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* 三轨道时间线 */}
          <section id="timeline" aria-labelledby="timeline-title" className="mt-2">
            <div className="flex items-center justify-between mb-4">
              <h2 id="timeline-title" className="text-lg font-semibold text-foreground">
                实时活动流
              </h2>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block size-2 rounded-full bg-blue-500" />
                  代码变更
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block size-2 rounded-full bg-purple-500" />
                  AI 对话
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block size-2 rounded-full bg-green-500" />
                  关卡判定
                </span>
              </div>
            </div>
            <Card>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {logsSource === 'mock' ? (
                    /* 演示数据渲染 */
                    MOCK_TIMELINE.map((item, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex-shrink-0 w-20 text-xs text-muted-foreground font-mono">
                          {item.time}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="font-medium text-foreground">{item.student}</span>
                            <span className="text-muted-foreground">{item.action}</span>
                            <span className="text-primary font-medium">{item.task}</span>
                          </div>
                        </div>
                        <div className="flex-shrink-0">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              item.status === '通过'
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                : item.status === '失败'
                                  ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                  : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                            }`}
                          >
                            {item.status}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : logs.length === 0 ? (
                    <div className="py-12 text-center text-sm text-muted-foreground">
                      暂无日志数据
                    </div>
                  ) : (
                    /* 真实日志渲染：三轨道 */
                    logs
                      .slice()
                      .reverse()
                      .map((entry) => {
                        const overrideKey = `${entry.studentId}:${entry.taskId}:${entry.checkpointId}`;
                        const isOverridden = overridden.has(overrideKey);
                        const canOverride =
                          entry.gateResult === 'failed' || entry.gateResult === 'escalated';
                        const isOverridingThis = overriding === overrideKey;

                        // 判断有哪些轨道内容
                        const hasCodeDiff = Boolean(entry.codeDiff && entry.codeDiff.trim());
                        const hasAiDialogue = Boolean(entry.promptText || entry.aiReply);
                        const hasGateResult = Boolean(entry.gateResult);

                        return (
                          <div
                            key={entry.id}
                            className="p-4 hover:bg-muted/50 transition-colors space-y-2"
                          >
                            {/* 行 1: 基础信息 */}
                            <div className="flex items-center gap-3">
                              <div className="flex-shrink-0 w-20 text-xs text-muted-foreground font-mono">
                                {formatTime(entry.ts)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 text-sm">
                                  <span className="font-medium text-foreground truncate">
                                    {entry.studentId}
                                  </span>
                                  <span className="text-muted-foreground shrink-0">·</span>
                                  <span className="text-primary font-medium truncate">
                                    {entry.taskId}
                                  </span>
                                  <span className="text-muted-foreground text-xs">
                                    {entry.checkpointId}
                                  </span>
                                </div>
                              </div>
                              {/* 关卡判定 Badge */}
                              {hasGateResult && (
                                <span
                                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${gateBadge(entry.gateResult)}`}
                                >
                                  {gateLabel(entry.gateResult)}
                                </span>
                              )}
                              {/* Override 按钮 */}
                              {canOverride && !isOverridden && (
                                <Button
                                  variant="outline"
                                  size="xs"
                                  onClick={() =>
                                    handleOverride(
                                      entry.studentId,
                                      entry.taskId,
                                      entry.checkpointId
                                    )
                                  }
                                  disabled={isOverridingThis}
                                >
                                  {isOverridingThis ? '放行中...' : '放行'}
                                </Button>
                              )}
                              {isOverridden && (
                                <span className="text-xs text-green-600 dark:text-green-400">
                                  已放行
                                </span>
                              )}
                            </div>

                            {/* 行 2: 三轨道内容 */}
                            <div className="ml-23 flex flex-wrap gap-2 text-xs">
                              {hasCodeDiff && (
                                <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
                                  <span className="inline-block size-1.5 rounded-full bg-blue-500" />
                                  代码变更
                                  {entry.codeDiff!.split('\n').length > 1 &&
                                    ` (+${entry.codeDiff!.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).length}/-${entry.codeDiff!.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---')).length})`}
                                </span>
                              )}
                              {hasAiDialogue && (
                                <span className="inline-flex items-center gap-1 rounded bg-purple-50 px-2 py-0.5 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400">
                                  <span className="inline-block size-1.5 rounded-full bg-purple-500" />
                                  AI 对话
                                  {entry.gateType && (
                                    <span className="text-purple-500 dark:text-purple-300">
                                      ({entry.gateType})
                                    </span>
                                  )}
                                </span>
                              )}
                              {hasGateResult && (
                                <span
                                  className={`inline-flex items-center gap-1 rounded px-2 py-0.5 ${
                                    entry.gateResult === 'passed'
                                      ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                                      : entry.gateResult === 'escalated'
                                        ? 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400'
                                        : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                                  }`}
                                >
                                  <span
                                    className={`inline-block size-1.5 rounded-full ${
                                      entry.gateResult === 'passed'
                                        ? 'bg-green-500'
                                        : entry.gateResult === 'escalated'
                                          ? 'bg-orange-500'
                                          : 'bg-red-500'
                                    }`}
                                  />
                                  关卡判定
                                </span>
                              )}
                            </div>

                            {/* 行 3: AI 对话摘要（如果存在） */}
                            {hasAiDialogue && entry.aiReply && (
                              <div className="ml-23 text-xs text-muted-foreground bg-muted/50 rounded px-3 py-2 max-w-2xl line-clamp-2">
                                {entry.aiReply.slice(0, 200)}
                                {entry.aiReply.length > 200 && '...'}
                              </div>
                            )}
                          </div>
                        );
                      })
                  )}
                </div>
              </CardContent>
            </Card>
          </section>

          {/* 趋势图表占位 */}
          <section id="charts" aria-labelledby="charts-title" className="mt-2">
            <h2 id="charts-title" className="text-lg font-semibold text-foreground mb-4">
              趋势图表 (占位)
            </h2>
            <Card>
              <CardContent className="py-12 px-4">
                <div className="text-center text-muted-foreground">
                  <svg
                    className="mx-auto mb-4 size-12 opacity-50"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden="true"
                  >
                    <path d="M3 3v18h18" />
                    <path d="m19 9-5 5-4-4-3 3" />
                  </svg>
                  <p className="text-lg font-medium text-foreground">图表组件待接入</p>
                  <p className="text-sm mt-1">
                    计划接入 Recharts / Tremor 实现提交趋势、分数分布、知识点掌握度等可视化
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>
        </div>
      </main>

      {/* 右侧 Luna 面板 */}
      <aside className="flex-shrink-0 w-[360px] border-l border-border bg-card hidden lg:block">
        <div className="flex h-full flex-col">
          <div className="flex h-12 items-center justify-between border-b border-border px-4">
            <h2 className="text-sm font-medium text-foreground">Luna AI 助教</h2>
          </div>
          <div className="flex-1 overflow-hidden">
            <div className="h-full">
              <p className="text-sm text-muted-foreground p-4 text-center">
                Luna AI 面板 - 教师视角占位
              </p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
