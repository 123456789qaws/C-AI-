'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/auth/AuthProvider';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AssignmentForm } from '@/components/class/AssignmentForm';
import { ArrowLeft, Users, BookOpen, BarChart3, CheckCircle2, Clock, Trophy } from 'lucide-react';

/* ============================================================
 * Types
 * ============================================================ */

interface Student {
  id: string;
  name: string;
  role: string;
  joinedAt: string;
}

interface ClassInfo {
  id: string;
  name: string;
  code: string;
  teacherId: string;
  _count?: { enrollments: number; assignments: number };
}

interface Assignment {
  id: string;
  taskId: string;
  task?: { id: string; title: string } | null;
  classId: string;
  class?: { id: string; name: string; code: string } | null;
  teacher?: { id: string; name: string } | null;
  deadline: string | null;
  assignedAt: string;
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

type TabKey = 'tasks' | 'students' | 'scores';

/* ============================================================
 * Helpers
 * ============================================================ */

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('luna-token');
}

function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
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
 * Tab Button
 * ============================================================ */

function TabBtn({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      {icon}
      {label}
      {count !== undefined && (
        <span
          className={`ml-1 inline-flex items-center justify-center rounded-full px-1.5 text-xs font-semibold ${
            active
              ? 'bg-primary-foreground/20 text-primary-foreground'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/* ============================================================
 * Main Component
 * ============================================================ */

export default function ClassDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const classId = params.id as string;

  const isTeacher = user?.role === 'TEACHER' || user?.role === 'TA' || user?.role === 'ADMIN';

  // Tab state
  const [activeTab, setActiveTab] = useState<TabKey>('tasks');

  // Class info
  const [cls, setCls] = useState<ClassInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // Teacher data
  const [students, setStudents] = useState<Student[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignLoading, setAssignLoading] = useState(false);

  // Student data
  const [studentAssignments, setStudentAssignments] = useState<StudentAssignment[]>([]);

  // Fetch class info (both roles)
  const fetchClass = useCallback(async () => {
    try {
      if (isTeacher) {
        const res = await fetch('/api/classes', { headers: authHeaders() });
        if (res.ok) {
          const data = await res.json();
          const found = (data.classes ?? []).find((c: ClassInfo) => c.id === classId);
          if (found) setCls(found);
        }
      } else {
        // Student: get from assignments
        const res = await fetch('/api/assignments/student?includeExpired=true', {
          headers: authHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          const assignments: StudentAssignment[] = data.assignments ?? [];
          const match = assignments.find((a) => a.classId === classId);
          if (match) {
            setCls({
              id: classId,
              name: match.className,
              code: match.classCode,
              teacherId: '',
            });
          }
        }
      }
    } catch {
      console.error('[class-detail] fetch class failed');
    }
  }, [classId, isTeacher]);

  // Fetch students (teacher only)
  const fetchStudents = useCallback(async () => {
    if (!isTeacher) return;
    try {
      const res = await fetch(`/api/classes/${classId}/enrollments`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setStudents(data.students ?? []);
      }
    } catch {
      console.error('[class-detail] fetch enrollments failed');
    }
  }, [classId, isTeacher]);

  // Fetch assignments (teacher)
  const fetchAssignments = useCallback(async () => {
    if (!isTeacher) return;
    try {
      const res = await fetch(`/api/assignments?classId=${classId}`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setAssignments(data.assignments ?? []);
      }
    } catch {
      console.error('[class-detail] fetch assignments failed');
    }
  }, [classId, isTeacher]);

  // Fetch student assignments
  const fetchStudentAssignments = useCallback(async () => {
    if (isTeacher) return;
    try {
      const res = await fetch('/api/assignments/student?includeExpired=true', {
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        const all: StudentAssignment[] = data.assignments ?? [];
        setStudentAssignments(all.filter((a) => a.classId === classId));
      }
    } catch {
      console.error('[class-detail] fetch student assignments failed');
    }
  }, [classId, isTeacher]);

  useEffect(() => {
    Promise.all([
      fetchClass(),
      fetchStudents(),
      fetchAssignments(),
      fetchStudentAssignments(),
    ]).finally(() => setLoading(false));
  }, [fetchClass, fetchStudents, fetchAssignments, fetchStudentAssignments]);

  // Create assignment handler
  const handleCreateAssignment = async (data: {
    taskId: string;
    classId: string;
    deadline: string | null;
  }) => {
    setAssignLoading(true);
    try {
      const res = await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        fetchAssignments();
      }
    } catch {
      console.error('[class-detail] create assignment failed');
    } finally {
      setAssignLoading(false);
    }
  };

  // Loading
  if (loading) {
    return (
      <AuthGuard roles={isTeacher ? ['TEACHER', 'ADMIN'] : ['STUDENT']}>
        <div className="flex min-h-[50vh] items-center justify-center">
          <p className="text-sm text-muted-foreground">加载中...</p>
        </div>
      </AuthGuard>
    );
  }

  // Not found
  if (!cls) {
    return (
      <AuthGuard roles={isTeacher ? ['TEACHER', 'ADMIN'] : ['STUDENT']}>
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
          <p className="text-sm text-muted-foreground">班级不存在或无权访问</p>
          <Button variant="outline" size="sm" onClick={() => router.push('/classes')}>
            返回班级列表
          </Button>
        </div>
      </AuthGuard>
    );
  }

  const tabs = isTeacher
    ? [
        { key: 'tasks' as TabKey, label: '任务管理', icon: <BookOpen className="size-4" /> },
        { key: 'students' as TabKey, label: '学生管理', icon: <Users className="size-4" /> },
        { key: 'scores' as TabKey, label: '分数视图', icon: <BarChart3 className="size-4" /> },
      ]
    : [{ key: 'tasks' as TabKey, label: '任务列表', icon: <BookOpen className="size-4" /> }];

  return (
    <AuthGuard roles={isTeacher ? ['TEACHER', 'ADMIN'] : ['STUDENT']}>
      <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto min-h-full">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="size-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-foreground truncate">{cls.name}</h1>
            <p className="text-sm text-muted-foreground">
              班级编码: <span className="font-mono font-semibold">{cls.code}</span>
              {isTeacher && students.length > 0 && (
                <span className="ml-2">· {students.length} 学生</span>
              )}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border pb-1 overflow-x-auto">
          {tabs.map((tab) => (
            <TabBtn
              key={tab.key}
              active={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              icon={tab.icon}
              label={tab.label}
              count={
                tab.key === 'students'
                  ? students.length
                  : tab.key === 'tasks'
                    ? isTeacher
                      ? assignments.length
                      : studentAssignments.length
                    : undefined
              }
            />
          ))}
        </div>

        {/* Tab Content */}
        <div className="min-h-0">
          {/* ==================== TASKS TAB ==================== */}
          {activeTab === 'tasks' && isTeacher && (
            <div className="space-y-4">
              {/* Assignment form */}
              <AssignmentForm
                classes={[{ id: cls.id, name: cls.name, code: cls.code }]}
                onSubmit={handleCreateAssignment}
                loading={assignLoading}
              />

              {/* Assignments list */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">已布置任务 ({assignments.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  {assignments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">尚未布置任务</p>
                  ) : (
                    <div className="space-y-2">
                      {assignments.map((a) => {
                        const cd = a.deadline ? deadlineCountdown(a.deadline) : null;
                        return (
                          <div
                            key={a.id}
                            className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2 min-w-0"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-foreground truncate">
                                {a.task?.title ?? a.taskId}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                布置于 {new Date(a.assignedAt).toLocaleDateString('zh-CN')}
                                {a.teacher && <span className="ml-1">· {a.teacher.name}</span>}
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
                                  {cd.expired ? '已截止' : cd.text}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ==================== TASKS TAB (Student) ==================== */}
          {activeTab === 'tasks' && !isTeacher && (
            <div className="space-y-3">
              {studentAssignments.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <BookOpen className="size-8 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">暂无分配任务</p>
                  </CardContent>
                </Card>
              ) : (
                studentAssignments.map((a) => {
                  const cd = a.deadline ? deadlineCountdown(a.deadline) : null;
                  return (
                    <Link
                      key={`${a.taskId}-${a.classId}`}
                      href={`/tasks/${a.taskId}?classId=${a.classId}`}
                    >
                      <Card className="transition-shadow hover:shadow-md cursor-pointer group">
                        <CardContent className="py-4">
                          <div className="flex items-center justify-between min-w-0">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">
                                {a.taskTitle}
                              </div>
                              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                <span>
                                  分配于 {new Date(a.assignedAt).toLocaleDateString('zh-CN')}
                                </span>
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
                                  <Clock className="size-3 inline mr-0.5" />
                                  {cd.expired ? '已截止' : cd.text}
                                </span>
                              )}
                              <Button variant="outline" size="xs">
                                {cd?.expired ? '查看' : '开始'}
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })
              )}
            </div>
          )}

          {/* ==================== STUDENTS TAB ==================== */}
          {activeTab === 'students' && isTeacher && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">学生名单 ({students.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {students.length === 0 ? (
                  <div className="py-8 text-center">
                    <Users className="size-8 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">暂无学生加入</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      将邀请码 <span className="font-mono font-semibold">{cls.code}</span>{' '}
                      分享给学生
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" role="table">
                      <thead>
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
                        {students.map((s) => (
                          <tr key={s.id} className="border-b border-border/50 hover:bg-muted/50">
                            <td className="px-3 py-2 font-mono text-foreground">{s.id}</td>
                            <td className="px-3 py-2 text-foreground">{s.name}</td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {new Date(s.joinedAt).toLocaleString('zh-CN')}
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

          {/* ==================== SCORES TAB ==================== */}
          {activeTab === 'scores' && isTeacher && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">分数视图</CardTitle>
              </CardHeader>
              <CardContent>
                {students.length === 0 ? (
                  <p className="text-sm text-muted-foreground">暂无学生数据</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" role="table">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                            学号
                          </th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                            姓名
                          </th>
                          <th className="text-center px-3 py-2 font-medium text-muted-foreground">
                            已布置任务
                          </th>
                          <th className="text-center px-3 py-2 font-medium text-muted-foreground">
                            状态
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {students.map((s) => (
                          <tr key={s.id} className="border-b border-border/50 hover:bg-muted/50">
                            <td className="px-3 py-2 font-mono text-foreground">{s.id}</td>
                            <td className="px-3 py-2 text-foreground">{s.name}</td>
                            <td className="px-3 py-2 text-center text-muted-foreground">
                              {assignments.length}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <Trophy className="size-3" />
                                待统计
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="mt-3 text-xs text-muted-foreground">
                      <CheckCircle2 className="size-3 inline mr-0.5" />
                      分数数据将在学生完成关卡后自动更新
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AuthGuard>
  );
}
