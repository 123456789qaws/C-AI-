'use client';

import { useCallback, useEffect, useState } from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ImportForm } from '@/components/class/ImportForm';

/* ============================================================
 * Types
 * ============================================================ */

interface ImportUser {
  id: string;
  name: string;
  role: 'STUDENT' | 'TEACHER' | 'TA' | 'ADMIN';
  password: string;
}

interface ImportResult {
  success: number;
  failed: number;
  errors?: Array<{ id: string; error: string }>;
}

interface ClassItem {
  id: string;
  name: string;
  code: string;
  teacherId: string;
  teacher?: { id: string; name: string } | null;
  _count?: { enrollments: number; assignments: number };
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
 * AdminPage — 账号导入与系统管理
 * ============================================================ */

export default function AdminPage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);

  /* — Fetch classes for admin view — */
  const fetchClasses = useCallback(async () => {
    try {
      const res = await fetch('/api/classes', { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setClasses(data.classes ?? []);
      }
    } catch {
      console.error('[admin] fetch classes failed');
    } finally {
      setClassesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  /* — Handle bulk import — */
  const handleImport = useCallback(async (users: ImportUser[]): Promise<ImportResult> => {
    const token = getToken();
    if (!token) {
      return { success: 0, failed: 0, errors: [{ id: '-', error: '未登录' }] };
    }

    const res = await fetch('/api/admin/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ users }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return {
        success: 0,
        failed: users.length,
        errors: [{ id: '-', error: err.error ?? '导入失败' }],
      };
    }

    return res.json();
  }, []);

  return (
    <AuthGuard roles={['ADMIN']}>
      <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-lg font-semibold text-foreground">管理后台</h1>
          <p className="text-sm text-muted-foreground">账号导入、班级管理、系统配置</p>
        </div>

        {/* Import form */}
        <ImportForm onImport={handleImport} />

        {/* Classes overview */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">班级管理</CardTitle>
            <CardDescription>查看所有班级列表与学生选课情况</CardDescription>
          </CardHeader>
          <CardContent>
            {classesLoading ? (
              <p className="text-sm text-muted-foreground">加载中...</p>
            ) : classes.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无班级</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" role="table">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                        班级名称
                      </th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                        编码
                      </th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                        教师
                      </th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                        学生数
                      </th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                        任务数
                      </th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {classes.map((c) => (
                      <tr key={c.id} className="border-b border-border/50 hover:bg-muted/50">
                        <td className="px-3 py-2 font-medium text-foreground">{c.name}</td>
                        <td className="px-3 py-2 font-mono text-muted-foreground">{c.code}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {c.teacher?.name ?? c.teacherId}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {c._count?.enrollments ?? 0}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {c._count?.assignments ?? 0}
                        </td>
                        <td className="px-3 py-2">
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => {
                              window.location.href = `/classes/${c.id}`;
                            }}
                          >
                            详情
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* System status placeholder */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">系统配置</CardTitle>
            <CardDescription>环境变量与 Provider 状态</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              查看 AI Provider、Judge Provider、数据库连接状态。
            </p>
          </CardContent>
        </Card>
      </div>
    </AuthGuard>
  );
}
