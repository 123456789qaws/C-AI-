'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AssignmentForm } from '@/components/class/AssignmentForm';
import TaskCreator from '@/components/task/TaskCreator';
import TaskTemplateManager from '@/components/task/TaskTemplateManager';

/* ============================================================
 * 看板统计口径（Bug3-stats）：
 * 总学生数 = 当前教师所教班级 enrollments 按 studentId 去重，
 * 在线人数 = 5 分钟窗口内有 AiInteractionLog 的去重 studentId，
 * 权威值来自 /api/dashboard/stats；空数据展示暂无文案，绝无 MOCK 假数。
 * ============================================================ */

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
  if (passRate >= 0.9) return 'bg-black';
  if (passRate >= 0.7) return 'bg-black/70';
  if (passRate >= 0.5) return 'bg-black/50';
  return 'bg-black/30';
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** T3-deadline: Date -> datetime-local input value (local tz, YYYY-MM-DDTHH:mm) */
function toLocalInputValue(deadline: string | null): string {
  if (!deadline) return '';
  const d = new Date(deadline);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function gateBadge(result: string) {
  switch (result) {
    case 'passed':
      return 'bg-black/10 text-black';
    case 'failed':
      return 'bg-black/20 text-black';
    case 'escalated':
      return 'bg-black/15 text-black';
    default:
      return 'bg-[#f7f7f7] text-[#666666]';
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
  /* —— 实时活动流折叠状态（默认收起，节省首屏纵向空间） —— */
  const [activityOpen, setActivityOpen] = useState(false);
  /* —— 看板统计（权威值来自 /api/dashboard/stats，班级去重口径） —— */
  interface DashboardStats {
    totalStudents: number;
    activeNow: number;
    avgScore: number;
    totalSubmissions: number;
    classCount: number;
    onlineWindowSec: number;
  }
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
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
  const [assignLoading, setAssignLoading] = useState(false);
  /* —— T39-assign: 批量布置结果摘要（已布置 / 已跳过已布置），constructive 操作无 confirm —— */
  const [assignMsg, setAssignMsg] = useState<string | null>(null);
  /* —— T39-assign: bump 后 AssignmentForm 重拉 GET /api/tasks（no-store），新任务免刷新可见 —— */
  const [assignTasksKey, setAssignTasksKey] = useState(0);
  /* —— T3-deadline: 看板已布置行改期态（tasks-tab 同款 inline 改期，constructive 无 confirm） —— */
  const [editingDeadlineId, setEditingDeadlineId] = useState<string | null>(null);
  const [deadlineDraft, setDeadlineDraft] = useState('');
  const [savingDeadlineId, setSavingDeadlineId] = useState<string | null>(null);
  /* —— T7-templates: 侧边栏新建模板折叠态（默认收起，保持导航紧凑） —— */
  const [templateCreatorOpen, setTemplateCreatorOpen] = useState(false);
  /* —— T1-side: 侧边栏导航 active 态 + 任务模板面板锚点滚动/聚焦 —— */
  const [activeSection, setActiveSection] = useState('overview');
  const taskTemplatesRef = useRef<HTMLElement | null>(null);
  const taskTemplatesTitleRef = useRef<HTMLHeadingElement | null>(null);
  const scrollToTaskTemplates = useCallback(() => {
    setActiveSection('tasks');
    setTemplateCreatorOpen(true);
    taskTemplatesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => {
      taskTemplatesTitleRef.current?.focus({ preventScroll: true });
    }, 350);
  }, []);

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
        if (Array.isArray(data.rows)) {
          setLogs(data.rows);
        } else {
          setLogs([]);
        }
      })
      .catch(() => {
        setLogs([]);
      });
  }, [role]);

  /* —— Step 2b: 拉取看板统计（班级去重口径，权威） —— */
  useEffect(() => {
    if (!role || role === 'STUDENT' || role === 'UNAUTHENTICATED') return;

    fetch('/api/dashboard/stats', { headers: authHeaders() })
      .then((r) => {
        if (!r.ok) throw new Error('stats fetch failed');
        return r.json();
      })
      .then((data) => {
        if (
          typeof data.totalStudents === 'number' &&
          typeof data.activeNow === 'number' &&
          typeof data.avgScore === 'number' &&
          typeof data.totalSubmissions === 'number'
        ) {
          setDashboardStats({
            totalStudents: data.totalStudents,
            activeNow: data.activeNow,
            avgScore: data.avgScore,
            totalSubmissions: data.totalSubmissions,
            classCount: typeof data.classCount === 'number' ? data.classCount : 0,
            onlineWindowSec: typeof data.onlineWindowSec === 'number' ? data.onlineWindowSec : 300,
          });
        } else {
          setDashboardStats(null);
        }
      })
      .catch(() => {
        setDashboardStats(null);
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
        const refreshRes = await fetch('/api/classes', { headers: authHeaders() });
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          setClasses(data.classes ?? []);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        console.error('[dashboard] create class failed:', err.error ?? res.statusText);
      }
    } catch {
      console.error('[dashboard] create class failed: network error');
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

  /* —— 布置任务（T39-assign 批量：一个 task × N 个 class，跳过已布置并汇总） —— */
  const handleAssignTask = useCallback(
    async (data: {
      taskId: string;
      classId: string;
      classIds?: string[];
      deadline: string | null;
    }) => {
      const classIds = data.classIds && data.classIds.length > 0 ? data.classIds : [data.classId];
      if (!data.taskId || classIds.length === 0) return;
      setAssignLoading(true);
      setAssignMsg(null);
      try {
        const res = await fetch('/api/assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({
            taskId: data.taskId,
            classIds,
            deadline: data.deadline,
          }),
        });
        const payload = await res.json().catch(() => ({}));
        if (res.ok) {
          const created = typeof payload.created === 'number' ? payload.created : classIds.length;
          const skipped = typeof payload.skipped === 'number' ? payload.skipped : 0;
          setAssignMsg(
            skipped > 0
              ? `已布置 ${created} 个班级，已跳过${skipped}个已布置`
              : `已布置 ${created} 个班级`
          );
          setAssignTasksKey((k) => k + 1);
          // Refresh assignments
          const refreshRes = await fetch('/api/assignments', { headers: authHeaders() });
          if (refreshRes.ok) {
            const refreshData = await refreshRes.json();
            setAssignments(refreshData.assignments ?? []);
          }
        } else {
          setAssignMsg(payload.error ?? `布置失败 (${res.status})`);
        }
      } catch {
        console.error('[dashboard] assign task failed');
        setAssignMsg('网络错误，请重试');
      } finally {
        setAssignLoading(false);
      }
    },
    []
  );

  /* —— T3-deadline: 看板改期已布置任务（PATCH {id, deadline: ISO|null}，空=无截止） —— */
  const handleSaveDeadline = useCallback(
    async (a: AssignmentItem, rawOverride?: string) => {
      const trimmed = (rawOverride ?? deadlineDraft).trim();
      let next: string | null;
      if (!trimmed) {
        next = null;
      } else {
        const t = new Date(trimmed).getTime();
        if (Number.isNaN(t)) {
          setAssignMsg('日期格式无效，请重新选择');
          return;
        }
        next = new Date(trimmed).toISOString();
      }
      setSavingDeadlineId(a.id);
      const prev = assignments;
      setAssignments((list) => list.map((x) => (x.id === a.id ? { ...x, deadline: next } : x)));
      try {
        const res = await fetch('/api/assignments', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ id: a.id, deadline: next }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          setAssignMsg(payload.error ?? `改期失败 (${res.status})`);
          setAssignments(prev);
        } else {
          const serverDeadline: string | null =
            (payload.assignment?.deadline as string | null | undefined) ?? next;
          setAssignments((list) =>
            list.map((x) => (x.id === a.id ? { ...x, deadline: serverDeadline } : x))
          );
          setEditingDeadlineId(null);
          setAssignMsg(
            serverDeadline
              ? `已改期至 ${new Date(serverDeadline).toLocaleDateString('zh-CN')}`
              : '已清除截止时间'
          );
        }
      } catch {
        setAssignMsg('网络错误，请重试');
        setAssignments(prev);
      } finally {
        setSavingDeadlineId(null);
      }
    },
    [assignments, deadlineDraft]
  );

  /* —— 计算热力图 —— */
  const heatData = useMemo(() => {
    if (logs.length === 0) return [];
    const aggregated = aggregateHeat(logs);
    return aggregated.map((h) => ({
      taskId: h.taskId,
      taskName: h.taskId,
      avgScore: 0,
      submissions: h.submissions,
      passRate: h.passRate,
    }));
  }, [logs]);

  /* —— 统计卡片 ——
   * 权威值来自 /api/dashboard/stats（所教班级 enrollments 去重 + 5 分钟在线窗口）；
   * stats 接口不可用时回退到日志聚合（学生数口径降级为日志去重，页面照常渲染空态）。
   */
  const stats = useMemo(() => {
    if (dashboardStats) return { ...dashboardStats, fromApi: true as const };
    if (logs.length === 0) {
      return {
        totalStudents: 0,
        activeNow: 0,
        avgScore: 0,
        totalSubmissions: 0,
        classCount: 0,
        onlineWindowSec: 300,
        fromApi: false as const,
      };
    }
    const uniqueStudents = new Set(logs.map((r) => r.studentId));
    const passed = logs.filter((r) => r.gateResult === 'passed').length;
    const total = logs.length;
    return {
      totalStudents: uniqueStudents.size,
      activeNow: 0,
      avgScore: total > 0 ? Math.round((passed / total) * 100) : 0,
      totalSubmissions: total,
      classCount: 0,
      onlineWindowSec: 300,
      fromApi: false as const,
    };
  }, [logs, dashboardStats]);

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
      <div className="flex h-screen w-full items-center justify-center bg-white">
        <p className="text-sm text-[#666666]">加载中...</p>
      </div>
    );
  }

  /* —— 无权限 / 未登录 —— */
  if (role === 'STUDENT') {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-white">
        <Card className="max-w-sm w-full">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <svg
              className="size-12 text-[#999999] opacity-50"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <p className="text-base font-medium text-black">无权限</p>
            <p className="text-sm text-[#666666] text-center">
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
      <div className="flex h-screen w-full items-center justify-center bg-white">
        <Card className="max-w-sm w-full">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <p className="text-base font-medium text-black">请先登录</p>
            <p className="text-sm text-[#666666] text-center">您需要登录教师账号才能访问看板。</p>
            <Button variant="outline" size="sm" onClick={() => (window.location.href = '/')}>
              前往登录
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-white">
      {/* 左侧导航 */}
      <aside className="flex-shrink-0 w-72 border-r border-[#dddddd] bg-[#f7f7f7] hidden lg:flex lg:flex-col lg:overflow-y-auto">
        <nav className="p-4 space-y-1" aria-label="教师看板导航">
          <div className="px-3 py-2 text-xs font-medium text-[#999999] uppercase tracking-wider">
            教师看板
          </div>
          <a
            href="#overview"
            onClick={() => setActiveSection('overview')}
            className={
              activeSection === 'overview'
                ? 'flex items-center gap-3 rounded-none px-3 py-2 text-sm font-medium text-black bg-black/10'
                : 'flex items-center gap-3 rounded-none px-3 py-2 text-sm text-[#666666] hover:bg-[#f7f7f7] hover:text-black transition-colors'
            }
            aria-current={activeSection === 'overview' ? 'page' : undefined}
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
            onClick={() => setActiveSection('students')}
            className={
              activeSection === 'students'
                ? 'flex items-center gap-3 rounded-none px-3 py-2 text-sm font-medium text-black bg-black/10'
                : 'flex items-center gap-3 rounded-none px-3 py-2 text-sm text-[#666666] hover:bg-[#f7f7f7] hover:text-black transition-colors'
            }
            aria-current={activeSection === 'students' ? 'page' : undefined}
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
            href="#dashboard-task-templates"
            onClick={(e) => {
              e.preventDefault();
              scrollToTaskTemplates();
            }}
            className={
              activeSection === 'tasks'
                ? 'flex items-center gap-3 rounded-none px-3 py-2 text-sm font-medium text-black bg-black/10'
                : 'flex items-center gap-3 rounded-none px-3 py-2 text-sm text-[#666666] hover:bg-[#f7f7f7] hover:text-black transition-colors'
            }
            aria-current={activeSection === 'tasks' ? 'page' : undefined}
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
            onClick={() => setActiveSection('analytics')}
            className={
              activeSection === 'analytics'
                ? 'flex items-center gap-3 rounded-none px-3 py-2 text-sm font-medium text-black bg-black/10'
                : 'flex items-center gap-3 rounded-none px-3 py-2 text-sm text-[#666666] hover:bg-[#f7f7f7] hover:text-black transition-colors'
            }
            aria-current={activeSection === 'analytics' ? 'page' : undefined}
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
        {/* ====== T7-templates: 侧边栏任务管理（模板查看/预览/编辑/删除 + 新建） ====== */}
        <section
          id="dashboard-task-templates"
          ref={taskTemplatesRef}
          aria-label="任务模板管理"
          aria-labelledby="sidebar-tasks-title"
          className="p-4 pt-0 space-y-2"
        >
          <h2
            id="sidebar-tasks-title"
            ref={taskTemplatesTitleRef}
            tabIndex={-1}
            className="px-3 py-2 text-xs font-medium text-[#999999] uppercase tracking-wider outline-none focus-visible:ring-1 focus-visible:ring-black"
          >
            任务管理
          </h2>
          <TaskTemplateManager
            refreshKey={assignTasksKey}
            onMutated={() => setAssignTasksKey((k) => k + 1)}
          />
          <Button
            variant="outline"
            size="sm"
            aria-expanded={templateCreatorOpen}
            aria-controls="sidebar-task-creator"
            onClick={() => setTemplateCreatorOpen((v) => !v)}
            className="w-full rounded-none"
          >
            {templateCreatorOpen ? '收起新建模板' : '新建任务模板'}
          </Button>
          {templateCreatorOpen && (
            <div id="sidebar-task-creator">
              <TaskCreator onCreated={() => setAssignTasksKey((k) => k + 1)} />
            </div>
          )}
        </section>
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 min-w-0 overflow-y-auto bg-white p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* 头部 */}
          <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-black">教师看板</h1>
              <p className="text-sm text-[#666666] mt-1">实时监控学生学习进度与代码提交情况</p>
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
                <CardTitle className="text-sm text-[#999999]">总学生数</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-black">{stats.totalStudents}</div>
                {stats.fromApi && (
                  <div className="mt-1 text-xs text-[#999999]">
                    {stats.classCount}个班级 · 去重统计
                  </div>
                )}
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-[#999999]">在线人数</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-black">{stats.activeNow}</div>
                <div className="mt-1 text-xs text-[#999999]">
                  {stats.fromApi
                    ? stats.activeNow > 0
                      ? '近5分钟活跃'
                      : '暂无在线数据 · 5分钟内无活动'
                    : '暂无在线数据'}
                </div>
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-[#999999]">平均通过率</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-black">
                  {stats.avgScore}
                  <span className="text-lg text-[#999999] ml-1">%</span>
                </div>
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-[#999999]">总提交数</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-black">{stats.totalSubmissions}</div>
              </CardContent>
            </Card>
          </div>

          {/* ====== 班级管理 ====== */}
          <section id="classes" aria-labelledby="classes-title">
            <h2 id="classes-title" className="text-lg font-semibold text-black mb-4">
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
                        className="mb-1 block text-xs font-medium text-[#999999]"
                      >
                        班级名称
                      </label>
                      <input
                        id="new-class-name"
                        type="text"
                        value={newClassName}
                        onChange={(e) => setNewClassName(e.target.value)}
                        placeholder="输入班级名称..."
                        className="w-full rounded-none border border-[#dddddd] bg-white px-3 py-1.5 text-sm text-black placeholder:text-[#666666] outline-none focus:border-black focus:ring-2 focus:ring-black/50"
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
                      <p className="text-sm text-[#666666] text-center py-4">暂无班级</p>
                    ) : (
                      classes.map((c) => (
                        <div
                          key={c.id}
                          className={`flex items-center justify-between rounded-none border px-3 py-2 transition-colors ${
                            selectedClassId === c.id
                              ? 'border-black bg-black/5'
                              : 'border-[#dddddd]/50 hover:bg-[#f7f7f7]'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-black truncate">{c.name}</div>
                            <div className="text-xs text-[#999999]">
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
                    <p className="text-sm text-[#666666]">加载中...</p>
                  ) : enrolledStudents.length === 0 ? (
                    <p className="text-sm text-[#666666]">暂无学生加入</p>
                  ) : (
                    <div className="overflow-x-auto max-h-[200px] overflow-y-auto">
                      <table className="w-full text-sm" role="table">
                        <thead className="sticky top-0 bg-[#f7f7f7]">
                          <tr className="border-b border-[#dddddd]">
                            <th className="text-left px-3 py-2 font-medium text-[#999999]">学号</th>
                            <th className="text-left px-3 py-2 font-medium text-[#999999]">姓名</th>
                            <th className="text-left px-3 py-2 font-medium text-[#999999]">
                              加入时间
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {enrolledStudents.map((s) => (
                            <tr key={s.id} className="border-b border-[#dddddd]/50">
                              <td className="px-3 py-2 font-mono text-black">{s.id}</td>
                              <td className="px-3 py-2 text-black">{s.name}</td>
                              <td className="px-3 py-2 text-[#999999]">
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
            <h2 id="assignments-title" className="text-lg font-semibold text-black mb-4">
              任务布置
            </h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {/* 布置表单（T39-assign：与班级页共享 AssignmentForm；任务下拉 live-fetch
                  GET /api/tasks no-store + refreshKey，新任务免刷新可见；multiSelect 多选班级；
                  collapsible 默认展开，与班级页独立折叠态） */}
              <div className="space-y-2">
                <AssignmentForm
                  classes={classes.map((c) => ({ id: c.id, name: c.name, code: c.code }))}
                  onSubmit={handleAssignTask}
                  loading={assignLoading}
                  refreshKey={assignTasksKey}
                  collapsible
                  defaultOpen
                  multiSelect
                />
                {assignMsg && (
                  <p className="text-xs text-[#666666]" role="status">
                    {assignMsg}
                  </p>
                )}
              </div>

              {/* 已布置任务列表 */}
              <Card>
                <CardContent className="pt-4">
                  <div className="max-h-[240px] overflow-y-auto space-y-2">
                    {assignments.length === 0 ? (
                      <p className="text-sm text-[#666666] text-center py-4">暂无布置任务</p>
                    ) : (
                      assignments.map((a) => (
                        <div
                          key={a.id}
                          className="flex items-center justify-between rounded-none border border-[#dddddd]/50 px-3 py-2 gap-2"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-black truncate">
                              {a.task?.title ?? a.taskId}
                            </div>
                            <div className="text-xs text-[#999999] truncate">
                              {a.class?.name ?? a.classId}
                              {a.deadline ? (
                                <span className="ml-2">
                                  截止: {new Date(a.deadline).toLocaleDateString('zh-CN')}
                                </span>
                              ) : (
                                <span className="ml-2">无截止</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {editingDeadlineId === a.id ? (
                              <>
                                <input
                                  type="datetime-local"
                                  aria-label={`修改 ${a.task?.title ?? a.taskId} 的截止时间，留空为无截止`}
                                  value={deadlineDraft}
                                  onChange={(e) => setDeadlineDraft(e.target.value)}
                                  className="w-44 rounded-none border border-[#dddddd] bg-white px-1.5 py-0.5 text-xs text-black outline-none focus:border-black"
                                />
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  disabled={savingDeadlineId === a.id}
                                  onClick={() => handleSaveDeadline(a)}
                                >
                                  {savingDeadlineId === a.id ? '保存中...' : '保存'}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  disabled={savingDeadlineId === a.id}
                                  onClick={() => {
                                    setDeadlineDraft('');
                                    handleSaveDeadline(a, '');
                                  }}
                                >
                                  无截止
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  onClick={() => setEditingDeadlineId(null)}
                                >
                                  取消
                                </Button>
                              </>
                            ) : (
                              <Button
                                variant="ghost"
                                size="xs"
                                aria-label={`改期 ${a.task?.title ?? a.taskId}`}
                                onClick={() => {
                                  setAssignMsg(null);
                                  setEditingDeadlineId(a.id);
                                  setDeadlineDraft(toLocalInputValue(a.deadline));
                                }}
                              >
                                改期
                              </Button>
                            )}
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
              <h2 id="heatmap-title" className="text-lg font-semibold text-black">
                任务热力图
              </h2>
              <span className="text-xs text-[#999999]">
                按通过率着色：黑≥90% 深灰≥70% 灰≥50% 浅灰&lt;50%
              </span>
            </div>
            <Card>
              <CardContent className="p-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" role="table">
                    <thead>
                      <tr className="border-b border-[#dddddd]">
                        <th className="text-left px-4 py-3 font-medium text-[#999999]">任务</th>
                        <th className="text-left px-4 py-3 font-medium text-[#999999]">提交数</th>
                        <th className="text-left px-4 py-3 font-medium text-[#999999]">通过率</th>
                        <th className="text-left px-4 py-3 font-medium text-[#999999]">热力</th>
                      </tr>
                    </thead>
                    <tbody>
                      {heatData.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-12 text-center text-sm text-[#666666]">
                            暂无数据
                          </td>
                        </tr>
                      ) : (
                        heatData.map((item) => (
                          <tr
                            key={item.taskId}
                            className="border-b border-[#dddddd]/50 hover:bg-[#f7f7f7]"
                          >
                            <td className="px-4 py-3 font-medium text-black">{item.taskName}</td>
                            <td className="px-4 py-3 text-[#999999]">{item.submissions}</td>
                            <td className="px-4 py-3 text-black">
                              {(item.passRate * 100).toFixed(1)}%
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div
                                  className={`h-4 w-24 rounded-none border ${getHeatColor(item.passRate)}`}
                                  style={{ width: `${Math.max(item.passRate * 100, 4)}%` }}
                                  role="img"
                                  aria-label={`${item.taskName} 通过率 ${(item.passRate * 100).toFixed(1)}%`}
                                />
                                <span className="text-xs text-[#999999] w-16 text-right">
                                  {(item.passRate * 100).toFixed(0)}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* 三轨道时间线（默认收起） */}
          <section id="timeline" aria-labelledby="timeline-title" className="mt-2">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h2 id="timeline-title" className="text-lg font-semibold text-foreground">
                  实时活动流
                </h2>
                <span className="inline-flex items-center rounded-none bg-black/10 px-2 py-0.5 text-xs font-medium text-black">
                  {logs.length}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground">
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
                <Button
                  variant="ghost"
                  size="sm"
                  aria-expanded={activityOpen}
                  aria-controls="timeline-body"
                  aria-label={activityOpen ? '收起实时活动流' : '展开实时活动流'}
                  onClick={() => setActivityOpen((v) => !v)}
                >
                  {activityOpen ? '收起' : '展开'}
                  <ChevronDown
                    className={`ml-1 size-3.5 transition-transform ${activityOpen ? 'rotate-180' : ''}`}
                  />
                </Button>
              </div>
            </div>
            {activityOpen && (
              <Card>
                <CardContent className="p-0" id="timeline-body">
                  <div className="divide-y divide-border">
                    {logs.length === 0 ? (
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
            )}
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
