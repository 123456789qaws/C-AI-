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
} from 'lucide-react';

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
}

/* ============================================================
 * Helpers
 * ============================================================ */

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('luna-token');
}

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
  const [loading, setLoading] = useState(true);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinMsg, setJoinMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [showExpired, setShowExpired] = useState(false);

  const fetchAssignments = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch('/api/assignments/student?includeExpired=true', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAssignments(data.assignments ?? []);
      }
    } catch {
      console.error('[classes] fetch assignments failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

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
        fetchAssignments();
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

  // Group by class
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
          <h1 className="text-xl font-bold text-foreground">我的学习</h1>
          <p className="text-sm text-muted-foreground mt-1">加入班级后即可开始完成编程任务</p>
        </div>

        {/* Join class */}
        <form onSubmit={handleJoin} className="flex items-end gap-2">
          <div>
            <label
              htmlFor="join-code"
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              邀请码
            </label>
            <input
              id="join-code"
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="6 位邀请码"
              maxLength={6}
              className="w-36 rounded-lg border border-border bg-background px-3 py-1.5 font-mono text-sm text-foreground uppercase placeholder:text-muted-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
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
          className={`rounded-lg px-3 py-2 text-sm ${
            joinMsg.type === 'ok'
              ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
              : 'bg-destructive/10 text-destructive'
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
                <BookOpen className="size-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">已加入班级</span>
              </div>
              <div className="text-2xl font-bold text-foreground mt-1">{classList.length}</div>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardContent className="pt-3">
              <div className="flex items-center gap-2">
                <Clock className="size-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">待完成任务</span>
              </div>
              <div className="text-2xl font-bold text-foreground mt-1">
                {activeAssignments.length}
              </div>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardContent className="pt-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">已截止任务</span>
              </div>
              <div className="text-2xl font-bold text-muted-foreground mt-1">
                {expiredAssignments.length}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Loading */}
      {loading && <p className="text-sm text-muted-foreground text-center py-8">加载中...</p>}

      {/* Empty state */}
      {!loading && classList.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="size-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">尚未加入任何班级</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              请向老师获取邀请码并输入上方加入
            </p>
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
                      <span className="inline-flex shrink-0 items-center rounded bg-muted px-2 py-0.5 font-mono text-xs font-semibold text-muted-foreground">
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
                    <p className="text-xs text-muted-foreground">暂无分配任务</p>
                  ) : (
                    <div className="space-y-2">
                      {cls.assignments.map((a) => {
                        const cd = a.deadline ? deadlineCountdown(a.deadline) : null;
                        return (
                          <div
                            key={`${a.taskId}-${a.classId}`}
                            className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2 min-w-0"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-foreground truncate">
                                {a.taskTitle}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                分配于 {new Date(a.assignedAt).toLocaleDateString('zh-CN')}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {cd && (
                                <span
                                  className={`text-xs font-medium ${
                                    cd.expired
                                      ? 'text-muted-foreground'
                                      : cd.urgent
                                        ? 'text-destructive'
                                        : 'text-green-600 dark:text-green-400'
                                  }`}
                                >
                                  {cd.text}
                                </span>
                              )}
                              <Link href={`/tasks/${a.taskId}?classId=${a.classId}`}>
                                <Button variant="outline" size="xs">
                                  {cd?.expired ? '查看' : '开始'}
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
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
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
  const [showCreator, setShowCreator] = useState(false);

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
    if (!token || !newClassName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newClassName.trim() }),
      });
      if (res.ok) {
        setNewClassName('');
        fetchClasses();
      }
    } catch {
      console.error('[classes] create class failed');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">班级管理</h1>
        <p className="text-sm text-muted-foreground mt-1">创建和管理你的教学班级</p>
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
                className="mb-1 block text-xs font-medium text-muted-foreground"
              >
                班级名称
              </label>
              <input
                id="new-class-name"
                type="text"
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                placeholder="例如: 2024级C语言1班"
                className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
                required
              />
            </div>
            <Button type="submit" disabled={creating || !newClassName.trim()} size="sm">
              <Plus className="size-3 mr-1" />
              {creating ? '创建中...' : '创建班级'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && <p className="text-sm text-muted-foreground text-center py-8">加载中...</p>}

      {/* Empty */}
      {!loading && classes.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="size-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">还没有创建任何班级</p>
            <p className="text-xs text-muted-foreground/70 mt-1">创建班级后即可布置任务给学生</p>
          </CardContent>
        </Card>
      )}

      {/* Class cards */}
      {!loading && classes.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {classes.map((cls) => (
            <Link key={cls.id} href={`/classes/${cls.id}`} className="block group">
              <Card className="h-full transition-shadow hover:shadow-md group-hover:border-primary/30">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base truncate">{cls.name}</CardTitle>
                    <ChevronRight className="size-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded bg-muted px-2 py-0.5 font-mono text-xs font-semibold text-muted-foreground">
                        {cls.code}
                      </span>
                      <span className="text-xs text-muted-foreground">邀请码</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
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
              </Card>
            </Link>
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
        {showCreator && <TaskCreator />}
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
          <p className="text-sm text-muted-foreground">加载中...</p>
        </div>
      </AuthGuard>
    );
  }

  const isTeacher = user?.role === 'TEACHER' || user?.role === 'TA' || user?.role === 'ADMIN';

  return (
    <AuthGuard>
      <div className="flex flex-col p-6 max-w-4xl mx-auto min-h-full">
        {isTeacher ? <TeacherView /> : <StudentView />}
      </div>
    </AuthGuard>
  );
}
