'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth/AuthProvider';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import TaskCreator from '@/components/task/TaskCreator';
import {
  Users,
  BookOpen,
  Plus,
  ChevronRight,
  CheckCircle2,
  Clock,
  AlertCircle,
  Trash2,
} from 'lucide-react';
import { getToken } from '@/lib/auth/client';

/* ============================================================
 * Types
 * ============================================================ */

interface ClassItem {
  id: string;
  name: string;
  code: string;
  teacherId: string;
  teacher?: { id: string; name: string } | null;
  _count?: { enrollments: number; assignments: number };
}

interface StudentAssignment {
  taskId: string;
  taskTitle: string;
  classId: string;
  className: string;
  classCode: string;
  deadline: string | null;
  assignedAt: string;
  submitted?: boolean;
}

interface EnrolledClass {
  id: string;
  name: string;
  code: string;
  teacherId: string;
  teacher?: { id: string; name: string } | null;
  _count?: { enrollments: number; assignments: number };
  joinedAt: string;
}

/* ============================================================
 * Helpers
 * ============================================================ */

function deadlineCountdown(deadline: string): { text: string; urgent: boolean; expired: boolean } {
  const now = Date.now();
  const dl = new Date(deadline).getTime();
  const diff = dl - now;
  if (diff <= 0) return { text: '已截止', urgent: false, expired: true };
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return { text: `${days}天${hours}小时`, urgent: days < 2, expired: false };
  const minutes = Math.floor((diff % 3600000) / 60000);
  return { text: `${hours}小时${minutes}分钟`, urgent: true, expired: false };
}

/* ============================================================
 * Student View
 * ============================================================ */

function StudentView() {
  const [assignments, setAssignments] = useState<StudentAssignment[]>([]);
  const [enrolledClasses, setEnrolledClasses] = useState<EnrolledClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinMsg, setJoinMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [showExpired, setShowExpired] = useState(false);

  const fetchData = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      // Fetch enrolled classes
      const classesRes = await fetch('/api/classes/student', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (classesRes.ok) {
        const classesData = await classesRes.json();
        setEnrolledClasses(classesData.classes ?? []);
      }

      // Fetch assignments
      const assignmentsRes = await fetch('/api/assignments/student?includeExpired=true', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (assignmentsRes.ok) {
        const assignmentsData = await assignmentsRes.json();
        setAssignments(assignmentsData.assignments ?? []);
      }
    } catch {
      console.error('[classes] fetch data failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = getToken();
    if (!token || !joinCode.trim()) return;
    setJoining(true);
    setJoinMsg(null);
    try {
      const res = await fetch('/api/classes/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code: joinCode.trim().toUpperCase() }),
      });
      if (res.ok) {
        const data = await res.json();
        setJoinMsg({ type: 'ok', text: `成功加入班级: ${data.class?.name ?? joinCode}` });
        setJoinCode('');
        fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        setJoinMsg({ type: 'err', text: err.error ?? '加入失败' });
      }
    } catch {
      setJoinMsg({ type: 'err', text: '网络错误' });
    } finally {
      setJoining(false);
    }
  };

  // Group by class (from assignments) and also include enrolled classes without assignments
  const classMap = new Map<
    string,
    { name: string; code: string; assignments: StudentAssignment[] }
  >();
  for (const a of assignments) {
    if (!classMap.has(a.classId)) {
      classMap.set(a.classId, { name: a.className, code: a.classCode, assignments: [] });
    }
    classMap.get(a.classId)!.assignments.push(a);
  }
  // Include enrolled classes that have no assignments yet
  for (const ec of enrolledClasses) {
    if (!classMap.has(ec.id)) {
      classMap.set(ec.id, { name: ec.name, code: ec.code, assignments: [] });
    }
  }
  const classList = Array.from(classMap.entries());

  const now = Date.now();
  const activeAssignments = assignments.filter(
    (a) => !a.deadline || new Date(a.deadline).getTime() > now
  );
  const expiredAssignments = assignments.filter(
    (a) => a.deadline && new Date(a.deadline).getTime() <= now
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Welcome + Join */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-4">
        <div className="flex-1">
          <h1 className="text-xl font-bold text-black">我的学习</h1>
          <p className="text-sm text-[#666666] mt-1">加入班级后即可开始完成编程任务</p>
        </div>

        {/* Join class */}
        <form onSubmit={handleJoin} className="flex items-end gap-2">
          <div>
            <label htmlFor="join-code" className="mb-1 block text-xs font-medium text-[#999999]">
              邀请码
            </label>
            <input
              id="join-code"
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="6 位邀请码"
              maxLength={6}
              className="w-36 rounded-none border border-[#dddddd] bg-white px-3 py-1.5 font-mono text-sm text-black uppercase placeholder:text-[#666666] outline-none focus:border-black focus:ring-2 focus:ring-black/50"
              required
            />
          </div>
          <Button type="submit" disabled={joining || joinCode.length < 6} size="sm">
            {joining ? '加入中...' : '加入班级'}
          </Button>
        </form>
      </div>

      {joinMsg && (
        <div
          className={`rounded-none px-3 py-2 text-sm ${
            joinMsg.type === 'ok' ? 'bg-black/10 text-black' : 'bg-black/10 text-black'
          }`}
        >
          {joinMsg.text}
        </div>
      )}

      {/* Stats */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Card size="sm">
            <CardContent className="pt-3">
              <div className="flex items-center gap-2">
                <BookOpen className="size-4 text-[#666666]" />
                <span className="text-xs text-[#999999]">已加入班级</span>
              </div>
              <div className="text-2xl font-bold text-black mt-1">{classList.length}</div>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardContent className="pt-3">
              <div className="flex items-center gap-2">
                <Clock className="size-4 text-[#666666]" />
                <span className="text-xs text-[#999999]">待完成任务</span>
              </div>
              <div className="text-2xl font-bold text-black mt-1">{activeAssignments.length}</div>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardContent className="pt-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-[#666666]" />
                <span className="text-xs text-[#999999]">已截止任务</span>
              </div>
              <div className="text-2xl font-bold text-[#999999] mt-1">
                {expiredAssignments.length}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Loading */}
      {loading && <p className="text-sm text-[#666666] text-center py-8">加载中...</p>}

      {/* Empty state */}
      {!loading && classList.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="size-8 text-[#999999]/30 mx-auto mb-3" />
            <p className="text-sm text-[#666666]">尚未加入任何班级</p>
            <p className="text-xs text-[#999999]/70 mt-1">请向老师获取邀请码并输入上方加入</p>
          </CardContent>
        </Card>
      )}

      {/* Class cards */}
      {!loading && classList.length > 0 && (
        <div className="space-y-4">
          {classList.map(([classId, cls]) => {
            return (
              <Card key={classId} className="overflow-hidden">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <CardTitle className="text-base truncate">{cls.name}</CardTitle>
                      <span className="inline-flex shrink-0 items-center rounded-none bg-[#f7f7f7] px-2 py-0.5 font-mono text-xs font-semibold text-[#999999]">
                        {cls.code}
                      </span>
                    </div>
                    <Link href={`/classes/${classId}`}>
                      <Button variant="ghost" size="xs">
                        查看
                        <ChevronRight className="size-3 ml-0.5" />
                      </Button>
                    </Link>
                  </div>
                </CardHeader>
                <CardContent>
                  {cls.assignments.length === 0 ? (
                    <p className="text-xs text-[#999999]">暂无分配任务</p>
                  ) : (
                    <div className="space-y-2">
                      {cls.assignments.map((a) => {
                        const cd = a.deadline ? deadlineCountdown(a.deadline) : null;
                        return (
                          <div
                            key={`${a.taskId}-${a.classId}`}
                            className="flex items-center justify-between rounded-none border border-[#dddddd]/50 px-3 py-2 min-w-0"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-black truncate">
                                {a.taskTitle}
                              </div>
                              <div className="text-xs text-[#666666]">
                                分配于 {new Date(a.assignedAt).toLocaleDateString('zh-CN')}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {a.submitted && (
                                <span className="inline-flex items-center gap-1 rounded-none bg-black px-2 py-0.5 text-xs font-medium text-white">
                                  <CheckCircle2 className="size-3" />
                                  已完成
                                </span>
                              )}
                              {cd && (
                                <span
                                  className={`text-xs font-medium ${
                                    cd.expired
                                      ? 'text-[#999999]'
                                      : cd.urgent
                                        ? 'text-black'
                                        : 'text-black/60'
                                  }`}
                                >
                                  {cd.text}
                                </span>
                              )}
                              <Link href={`/tasks/${a.taskId}?classId=${a.classId}`}>
                                <Button variant="outline" size="xs">
                                  {a.submitted ? '已完成' : cd?.expired ? '查看' : '开始'}
                                </Button>
                              </Link>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {/* Expired toggle */}
          {expiredAssignments.length > 0 && (
            <button
              type="button"
              onClick={() => setShowExpired(!showExpired)}
              className="flex items-center gap-1 text-xs text-[#999999] hover:text-black transition-colors"
            >
              <AlertCircle className="size-3" />
              {showExpired ? '收起已截止任务' : `查看已截止任务 (${expiredAssignments.length})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * Teacher View
 * ============================================================ */

function TeacherView() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newClassName, setNewClassName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showCreator, setShowCreator] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  // Bumped every time TaskCreator reports a new task so any task list
  // on this page (or navigated-to assign forms) refetches fresh data.
  const [taskRefreshKey, setTaskRefreshKey] = useState(0);

  const fetchClasses = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch('/api/classes', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setClasses(data.classes ?? []);
      }
    } catch {
      console.error('[classes] fetch classes failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = getToken();
    if (!token) {
      setCreateError('登录已过期，请重新登录');
      return;
    }
    if (!newClassName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newClassName.trim() }),
      });
      if (res.ok) {
        setNewClassName('');
        fetchClasses();
      } else {
        const err = await res.json().catch(() => ({}));
        setCreateError(err.error ?? `创建失败 (${res.status})`);
      }
    } catch {
      setCreateError('网络错误，请重试');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteClass = async (cls: ClassItem) => {
    if (!confirm(`确定删除班级 "${cls.name}" ？该操作不可恢复`)) return;
    const token = getToken();
    if (!token) {
      setCreateError('登录已过期，请重新登录');
      return;
    }
    setDeletingId(cls.id);
    setCreateError(null);
    try {
      const res = await fetch(`/api/classes/${cls.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setClasses((prev) => prev.filter((c) => c.id !== cls.id));
        setToastMsg(`班级 "${cls.name}" 已删除`);
        setTimeout(() => setToastMsg(null), 3000);
      } else {
        const err = await res.json().catch(() => ({}));
        setCreateError(err.error ?? `删除失败 (${res.status})`);
      }
    } catch {
      setCreateError('网络错误，请重试');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-black">班级管理</h1>
        <p className="text-sm text-[#666666] mt-1">创建和管理你的教学班级</p>
      </div>

      {/* Create class form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">创建新班级</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateClass} className="flex items-end gap-3">
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
                placeholder="例如: 2024级C语言1班"
                className="w-full rounded-none border border-[#dddddd] bg-white px-3 py-1.5 text-sm text-black placeholder:text-[#666666] outline-none focus:border-black focus:ring-2 focus:ring-black/50"
                required
              />
            </div>
            <Button type="submit" disabled={creating || !newClassName.trim()} size="sm">
              <Plus className="size-3 mr-1" />
              {creating ? '创建中...' : '创建班级'}
            </Button>
          </form>
          {createError && <p className="mt-2 text-sm text-black">{createError}</p>}
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && <p className="text-sm text-[#666666] text-center py-8">加载中...</p>}

      {/* Empty */}
      {!loading && classes.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="size-8 text-[#999999]/30 mx-auto mb-3" />
            <p className="text-sm text-[#666666]">还没有创建任何班级</p>
            <p className="text-xs text-[#999999]/70 mt-1">创建班级后即可布置任务给学生</p>
          </CardContent>
        </Card>
      )}

      {toastMsg && (
        <div className="rounded-none bg-black px-3 py-2 text-sm text-white">{toastMsg}</div>
      )}

      {/* Class cards */}
      {!loading && classes.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {classes.map((cls) => (
            <Card
              key={cls.id}
              className="h-full overflow-hidden transition-shadow hover:shadow-md group"
            >
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/classes/${cls.id}`}
                    className="flex flex-1 items-center justify-between gap-2 min-w-0 group/link"
                  >
                    <CardTitle className="text-base truncate group-hover/link:text-black">
                      {cls.name}
                    </CardTitle>
                    <ChevronRight className="size-4 shrink-0 text-[#999999] group-hover/link:text-black transition-colors" />
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`删除班级 ${cls.name}`}
                    disabled={deletingId === cls.id}
                    onClick={() => handleDeleteClass(cls)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <Link href={`/classes/${cls.id}`} className="block">
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-none bg-[#f7f7f7] px-2 py-0.5 font-mono text-xs font-semibold text-[#999999]">
                        {cls.code}
                      </span>
                      <span className="text-xs text-[#999999]">邀请码</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-[#999999]">
                      <span className="flex items-center gap-1">
                        <Users className="size-3" />
                        {cls._count?.enrollments ?? 0} 学生
                      </span>
                      <span className="flex items-center gap-1">
                        <BookOpen className="size-3" />
                        {cls._count?.assignments ?? 0} 任务
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Link>
            </Card>
          ))}
        </div>
      )}

      {/* Task Creator toggle */}
      <div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowCreator(!showCreator)}
          className="mb-4"
        >
          <Plus className="size-3 mr-1" />
          {showCreator ? '收起任务创建器' : '创建新任务'}
        </Button>
        {showCreator && (
          <TaskCreator
            key={taskRefreshKey}
            onCreated={(taskId) => {
              setTaskRefreshKey((k) => k + 1);
              setToastMsg(`任务 "${taskId}" 已创建，可前往班级页面布置`);
              setTimeout(() => setToastMsg(null), 4000);
            }}
          />
        )}
      </div>
    </div>
  );
}

/* ============================================================
 * Main Page
 * ============================================================ */

export default function ClassesPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <AuthGuard>
        <div className="flex min-h-[50vh] items-center justify-center">
          <p className="text-sm text-[#666666]">加载中...</p>
        </div>
      </AuthGuard>
    );
  }

  const isTeacher = user?.role === 'TEACHER' || user?.role === 'TA' || user?.role === 'ADMIN';

  return (
    <AuthGuard>
      <div className="flex flex-col p-6 max-w-4xl mx-auto min-h-full gap-12">
        {isTeacher ? <TeacherView /> : <StudentView />}
      </div>
    </AuthGuard>
  );
}
