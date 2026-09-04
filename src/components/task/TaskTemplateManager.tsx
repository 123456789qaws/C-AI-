'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/* ============================================================
 * TaskTemplateManager — T7 sidebar 任务模板管理
 * Live list from GET /api/tasks (no-store) + refreshKey shared with
 * dashboard assign dropdown (T39 convention: bump refreshes both).
 * Rows: title + N关 + 预览(/tasks/<id>?preview=1 学生真实布局) /
 * 编辑(inline title/intro/mode → PATCH) / 删除(confirm → DELETE).
 * ============================================================ */

export interface TemplateTask {
  id: string;
  title: string;
  intro: string | null;
  checkpointMode: 'sequential' | 'free';
  checkpoints: Array<unknown>;
}

interface TaskTemplateManagerProps {
  refreshKey?: number | string;
  onMutated?: () => void;
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('luna-token');
}

export default function TaskTemplateManager({ refreshKey, onMutated }: TaskTemplateManagerProps) {
  const [tasks, setTasks] = useState<TemplateTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editIntro, setEditIntro] = useState('');
  const [editMode, setEditMode] = useState<'sequential' | 'free'>('sequential');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tasks', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`加载失败 (${res.status})`);
      const data = await res.json();
      setTasks(Array.isArray(data.tasks) ? (data.tasks as TemplateTask[]) : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks, refreshKey]);

  const startEdit = (t: TemplateTask) => {
    setEditingId(t.id);
    setEditTitle(t.title);
    setEditIntro(t.intro ?? '');
    setEditMode(t.checkpointMode);
    setError(null);
  };

  const handleSave = async (id: string) => {
    const token = getToken();
    if (!token) return;
    if (!editTitle.trim()) {
      setError('标题不能为空');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: editTitle.trim(),
          intro: editIntro.trim(),
          checkpointMode: editMode,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error ?? `保存失败 (${res.status})`);
      setEditingId(null);
      await fetchTasks();
      onMutated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (t: TemplateTask) => {
    if (!confirm(`确定删除任务模板「${t.title}」？该操作不可恢复`)) return;
    const token = getToken();
    if (!token) return;
    setDeletingId(t.id);
    setError(null);
    setTasks((prev) => prev.filter((x) => x.id !== t.id));
    try {
      const res = await fetch(`/api/tasks/${t.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setError(payload.error ?? `删除失败 (${res.status})`);
        await fetchTasks();
      } else {
        onMutated?.();
      }
    } catch {
      setError('网络错误，请重试');
      await fetchTasks();
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card className="rounded-none">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">任务模板管理 ({tasks.length})</CardTitle>
          <button
            type="button"
            onClick={() => void fetchTasks()}
            aria-label="刷新任务模板列表"
            className="text-xs text-[#999999] underline decoration-dotted underline-offset-2 hover:text-black"
          >
            {loading ? '刷新中...' : '刷新'}
          </button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {error && (
          <p className="mb-2 text-xs text-black" role="alert">
            {error}
          </p>
        )}
        {tasks.length === 0 && !loading ? (
          <p className="py-3 text-center text-xs text-[#666666]">暂无任务模板</p>
        ) : (
          <div className="max-h-[320px] space-y-1.5 overflow-y-auto">
            {tasks.map((t) => {
              const count = Array.isArray(t.checkpoints) ? t.checkpoints.length : 0;
              const expanded = editingId === t.id;
              return (
                <div key={t.id} className="rounded-none border border-[#dddddd]/50 px-2 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium text-black">{t.title}</div>
                      <div className="text-[11px] text-[#999999]">{count}关</div>
                    </div>
                    <Link
                      href={`/tasks/${t.id}?preview=1`}
                      aria-label={`预览任务 ${t.title}`}
                      title="预览"
                      className="rounded-none px-1.5 py-1 text-[11px] text-black underline decoration-dotted underline-offset-2 hover:text-black/70"
                    >
                      预览
                    </Link>
                    <button
                      type="button"
                      onClick={() => (expanded ? setEditingId(null) : startEdit(t))}
                      aria-label={expanded ? `取消编辑 ${t.title}` : `编辑任务 ${t.title}`}
                      title="编辑"
                      className="rounded-none px-1.5 py-1 text-[11px] text-[#666666] hover:text-black"
                    >
                      {expanded ? '收起' : '编辑'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(t)}
                      disabled={deletingId === t.id}
                      aria-label={`删除任务 ${t.title}`}
                      title="删除"
                      className="rounded-none px-1.5 py-1 text-[11px] text-[#666666] hover:text-black disabled:opacity-50"
                    >
                      {deletingId === t.id ? '删除中' : '删除'}
                    </button>
                  </div>
                  {expanded && (
                    <div className="mt-2 space-y-2 border-t border-[#dddddd]/50 pt-2">
                      <div>
                        <label
                          htmlFor={`tm-title-${t.id}`}
                          className="mb-0.5 block text-[11px] font-medium text-[#999999]"
                        >
                          标题
                        </label>
                        <input
                          id={`tm-title-${t.id}`}
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="w-full rounded-none border border-[#dddddd] bg-white px-2 py-1 text-xs text-black outline-none focus:border-black"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`tm-intro-${t.id}`}
                          className="mb-0.5 block text-[11px] font-medium text-[#999999]"
                        >
                          简介
                        </label>
                        <textarea
                          id={`tm-intro-${t.id}`}
                          value={editIntro}
                          onChange={(e) => setEditIntro(e.target.value)}
                          rows={2}
                          className="w-full resize-none rounded-none border border-[#dddddd] bg-white px-2 py-1 text-xs text-black outline-none focus:border-black"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditMode('sequential')}
                          aria-pressed={editMode === 'sequential'}
                          className={`rounded-none border px-2 py-1 text-[11px] font-medium ${
                            editMode === 'sequential'
                              ? 'border-black bg-black text-white'
                              : 'border-[#dddddd] text-[#666666]'
                          }`}
                        >
                          顺序
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditMode('free')}
                          aria-pressed={editMode === 'free'}
                          className={`rounded-none border px-2 py-1 text-[11px] font-medium ${
                            editMode === 'free'
                              ? 'border-black bg-black text-white'
                              : 'border-[#dddddd] text-[#666666]'
                          }`}
                        >
                          自由
                        </button>
                        <span className="flex-1" />
                        <Button
                          size="xs"
                          variant="outline"
                          className="rounded-none"
                          onClick={() => setEditingId(null)}
                          disabled={saving}
                        >
                          取消
                        </Button>
                        <Button
                          size="xs"
                          className="rounded-none"
                          onClick={() => void handleSave(t.id)}
                          disabled={saving}
                        >
                          {saving ? '保存中...' : '保存'}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
