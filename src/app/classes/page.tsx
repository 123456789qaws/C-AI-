'use client';

import { useCallback, useEffect, useState } from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

/* ============================================================
 * Types
 * ============================================================ */

interface Assignment {
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
 * StudentClassesPage
 * ============================================================ */

export default function StudentClassesPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinMsg, setJoinMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [showAll, setShowAll] = useState(false);

  /* — Fetch student assignments — */
  const fetchAssignments = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`/api/assignments/student?includeExpired=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAssignments(data.assignments ?? []);
      }
    } catch {
      console.error('[student-classes] fetch assignments failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  /* — Join class — */
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

  /* — Derived data: unique classes from assignments — */
  const classMap = new Map<string, { name: string; code: string; assignments: Assignment[] }>();
  for (const a of assignments) {
    if (!classMap.has(a.classId)) {
      classMap.set(a.classId, { name: a.className, code: a.classCode, assignments: [] });
    }
    classMap.get(a.classId)!.assignments.push(a);
  }
  const classList = Array.from(classMap.entries());

  /* — Expired — */
  const expiredAssignments = assignments.filter((a) => {
    if (!a.deadline) return false;
    return new Date(a.deadline).getTime() <= Date.now();
  });

  return (
    <AuthGuard roles={['STUDENT']}>
      <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-lg font-semibold text-foreground">我的班级</h1>
          <p className="text-sm text-muted-foreground">查看已加入的班级与分配的任务</p>
        </div>

        {/* Join class form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">加入班级</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleJoin} className="flex items-end gap-3">
              <div className="flex-1">
                <label
                  htmlFor="join-code"
                  className="mb-1 block text-xs font-medium text-muted-foreground"
                >
                  班级邀请码
                </label>
                <input
                  id="join-code"
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="输入 6 位邀请码"
                  maxLength={6}
                  className="w-full rounded-lg border border-border bg-background px-3 py-1.5 font-mono text-sm text-foreground uppercase placeholder:text-muted-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
                  required
                />
              </div>
              <Button type="submit" disabled={joining || joinCode.length < 6} size="sm">
                {joining ? '加入中...' : '加入'}
              </Button>
            </form>
            {joinMsg && (
              <p
                className={`mt-2 text-xs ${joinMsg.type === 'ok' ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}
              >
                {joinMsg.text}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Loading */}
        {loading && <p className="text-sm text-muted-foreground text-center py-8">加载中...</p>}

        {/* No classes */}
        {!loading && classList.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-sm text-muted-foreground">尚未加入任何班级，请使用邀请码加入。</p>
            </CardContent>
          </Card>
        )}

        {/* Class list */}
        {!loading && classList.length > 0 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted-foreground">
                {classList.length} 个班级
              </h2>
            </div>

            {classList.map(([classId, cls]) => (
              <Card key={classId}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{cls.name}</CardTitle>
                    <span className="inline-flex items-center rounded bg-muted px-2 py-0.5 font-mono text-xs font-semibold text-muted-foreground">
                      {cls.code}
                    </span>
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
                            className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-foreground">
                                {a.taskTitle}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                分配于 {new Date(a.assignedAt).toLocaleDateString('zh-CN')}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
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
                              <Button
                                variant="outline"
                                size="xs"
                                onClick={() => {
                                  window.location.href = `/tasks/${a.taskId}`;
                                }}
                              >
                                开始
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}

            {/* Show expired assignments toggle */}
            {expiredAssignments.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowAll(!showAll)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showAll ? '收起' : `查看已截止任务 (${expiredAssignments.length})`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
