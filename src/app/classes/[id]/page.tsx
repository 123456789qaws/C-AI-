'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AssignmentForm } from '@/components/class/AssignmentForm';

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

/* ============================================================
 * TeacherClassDetailPage
 * ============================================================ */

export default function TeacherClassDetailPage() {
  const params = useParams();
  const router = useRouter();
  const classId = params.id as string;

  const [cls, setCls] = useState<ClassInfo | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignLoading, setAssignLoading] = useState(false);

  /* — Fetch class info — */
  const fetchClass = useCallback(async () => {
    try {
      const res = await fetch('/api/classes', { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        const found = (data.classes ?? []).find((c: ClassInfo) => c.id === classId);
        if (found) setCls(found);
      }
    } catch {
      console.error('[class-detail] fetch class info failed');
    }
  }, [classId]);

  /* — Fetch enrollments — */
  const fetchStudents = useCallback(async () => {
    try {
      const res = await fetch(`/api/classes/${classId}/enrollments`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setStudents(data.students ?? []);
      }
    } catch {
      console.error('[class-detail] fetch enrollments failed');
    }
  }, [classId]);

  /* — Fetch assignments — */
  const fetchAssignments = useCallback(async () => {
    try {
      const res = await fetch(`/api/assignments?classId=${classId}`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setAssignments(data.assignments ?? []);
      }
    } catch {
      console.error('[class-detail] fetch assignments failed');
    }
  }, [classId]);

  useEffect(() => {
    Promise.all([fetchClass(), fetchStudents(), fetchAssignments()]).finally(() =>
      setLoading(false)
    );
  }, [fetchClass, fetchStudents, fetchAssignments]);

  /* — Create assignment — */
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

  if (loading) {
    return (
      <AuthGuard roles={['TEACHER', 'ADMIN']}>
        <div className="flex min-h-[50vh] items-center justify-center">
          <p className="text-sm text-muted-foreground">加载中...</p>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard roles={['TEACHER', 'ADMIN']}>
      <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <svg
              className="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </Button>
          <div>
            <h1 className="text-lg font-semibold text-foreground">{cls?.name ?? '班级详情'}</h1>
            <p className="text-sm text-muted-foreground">
              班级编码: <span className="font-mono font-semibold">{cls?.code}</span>
            </p>
          </div>
        </div>

        {/* Enrollments */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">学生名单 ({students.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {students.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无学生加入</p>
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

        {/* Assignment form */}
        {cls && (
          <AssignmentForm
            classes={[{ id: cls.id, name: cls.name, code: cls.code }]}
            onSubmit={handleCreateAssignment}
            loading={assignLoading}
          />
        )}

        {/* Existing assignments */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">已布置任务 ({assignments.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {assignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">尚未布置任务</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" role="table">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                        任务
                      </th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                        布置时间
                      </th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                        截止时间
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map((a) => (
                      <tr key={a.id} className="border-b border-border/50 hover:bg-muted/50">
                        <td className="px-3 py-2 font-medium text-foreground">
                          {a.task?.title ?? a.taskId}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {new Date(a.assignedAt).toLocaleString('zh-CN')}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {a.deadline ? (
                            new Date(a.deadline).toLocaleString('zh-CN')
                          ) : (
                            <span className="text-muted-foreground/60">无截止</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AuthGuard>
  );
}
