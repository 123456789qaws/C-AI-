'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/* ============================================================
 * Types
 * ============================================================ */

export interface ClassOption {
  id: string;
  name: string;
  code: string;
}

export interface TaskOption {
  id: string;
  title: string;
}

export interface AssignmentResult {
  id: string;
  taskId: string;
  task?: { id: string; title: string } | null;
  classId: string;
  class?: { id: string; name: string; code: string } | null;
  deadline?: string | null;
  assignedAt: string;
}

/* ============================================================
 * AssignmentForm — teacher creates an assignment for a class
 * ============================================================ */

export interface AssignmentSubmitData {
  taskId: string;
  classId: string;
  /** Batch target classes (multi-select mode). classId mirrors classIds[0] for legacy callers. */
  classIds?: string[];
  deadline: string | null;
}

interface AssignmentFormProps {
  classes: ClassOption[];
  onSubmit: (data: AssignmentSubmitData) => Promise<void>;
  loading?: boolean;
  /** Optional externally-provided task list (e.g. parent already fetched GET /api/tasks). */
  tasks?: TaskOption[];
  /** Bump to force a refetch of the task list (e.g. after TaskCreator onCreated). */
  refreshKey?: number | string;
  /** Show a 收起/展开 toggle in the header. Default false (always expanded). */
  collapsible?: boolean;
  /** Initial open state when collapsible. Default true (expanded). */
  defaultOpen?: boolean;
  /** Render multi-select class checkboxes (+全部班级) instead of single select. Default false. */
  multiSelect?: boolean;
}

const FALLBACK_TASK_OPTIONS: TaskOption[] = [
  { id: 'fib_L2', title: 'fib_L2 (递归 / Fibonacci)' },
  { id: 'linked_list_reverse', title: 'linked_list_reverse (链表反转)' },
];

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('luna-token');
}

export function AssignmentForm({
  classes,
  onSubmit,
  loading,
  tasks,
  refreshKey,
  collapsible = false,
  defaultOpen = true,
  multiSelect = false,
}: AssignmentFormProps) {
  const [taskId, setTaskId] = useState('');
  const [classId, setClassId] = useState('');
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [deadline, setDeadline] = useState('');
  const [open, setOpen] = useState(defaultOpen);
  const [remoteTasks, setRemoteTasks] = useState<TaskOption[] | null>(null);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [assignMsg, setAssignMsg] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    // Parent-provided list wins; still allow focus-refetch to refresh it via onTasksChanged? No — skip fetch.
    if (tasks) return;
    const token = getToken();
    if (!token) return;
    setTasksLoading(true);
    try {
      const res = await fetch('/api/tasks', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        const list: TaskOption[] = (data.tasks ?? []).map((t: { id: string; title: string }) => ({
          id: t.id,
          title: t.title,
        }));
        if (list.length > 0) setRemoteTasks(list);
      }
    } catch {
      // ignore — fallback options remain visible
    } finally {
      setTasksLoading(false);
    }
  }, [tasks]);

  // Fetch live task list on mount + whenever parent signals a new task was created.
  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks, refreshKey]);

  const visibleTasks = tasks ?? remoteTasks ?? FALLBACK_TASK_OPTIONS;

  const allSelected = classes.length > 0 && selectedClassIds.length === classes.length;

  const toggleClass = (id: string) => {
    setAssignMsg(null);
    setSelectedClassIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    setAssignMsg(null);
    setSelectedClassIds((prev) => (prev.length === classes.length ? [] : classes.map((c) => c.id)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAssignMsg(null);
    if (!taskId) return;
    if (multiSelect) {
      if (selectedClassIds.length === 0) {
        setAssignMsg('请至少选择一个班级');
        return;
      }
      await onSubmit({
        taskId,
        classId: selectedClassIds[0],
        classIds: selectedClassIds,
        deadline: deadline ? new Date(deadline).toISOString() : null,
      });
      setTaskId('');
      setSelectedClassIds([]);
      setDeadline('');
      return;
    }
    if (!classId) return;
    await onSubmit({
      taskId,
      classId,
      deadline: deadline ? new Date(deadline).toISOString() : null,
    });
    setTaskId('');
    setClassId('');
    setDeadline('');
  };

  const canSubmit = multiSelect
    ? Boolean(taskId) && selectedClassIds.length > 0
    : Boolean(taskId) && Boolean(classId);

  return (
    <Card>
      <CardHeader>
        {collapsible ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? '收起布置任务' : '展开布置任务'}
            className="flex w-full items-center justify-between text-left"
          >
            <CardTitle className="text-base">布置任务</CardTitle>
            <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              {open ? '收起' : '展开'}
              <ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} />
            </span>
          </button>
        ) : (
          <CardTitle className="text-base">布置任务</CardTitle>
        )}
      </CardHeader>
      {open && (
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label
                htmlFor="assign-task"
                className="mb-1 block text-xs font-medium text-muted-foreground"
              >
                任务
              </label>
              <select
                id="assign-task"
                value={taskId}
                onChange={(e) => setTaskId(e.target.value)}
                onFocus={() => void fetchTasks()}
                className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
                required
              >
                <option value="">{tasksLoading ? '加载任务列表...' : '选择任务...'}</option>
                {visibleTasks.map((t: TaskOption) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </div>

            {multiSelect ? (
              <div>
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  班级（可多选，至少选一个）
                </span>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="全部班级"
                    className="size-4 accent-black"
                  />
                  全部班级 ({classes.length})
                </label>
                <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                  {classes.length === 0 ? (
                    <p className="text-xs text-muted-foreground">暂无班级</p>
                  ) : (
                    classes.map((c) => (
                      <label
                        key={c.id}
                        className="flex cursor-pointer items-center gap-2 rounded-lg border border-border/60 px-3 py-1.5 text-sm hover:bg-muted/50"
                      >
                        <input
                          type="checkbox"
                          checked={selectedClassIds.includes(c.id)}
                          onChange={() => toggleClass(c.id)}
                          aria-label={`选择班级 ${c.name}`}
                          className="size-4 accent-black"
                        />
                        <span className="truncate">
                          {c.name} ({c.code})
                        </span>
                      </label>
                    ))
                  )}
                </div>
                {selectedClassIds.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground" role="status">
                    已选 {selectedClassIds.length} 个班级
                  </p>
                )}
              </div>
            ) : (
              <div>
                <label
                  htmlFor="assign-class"
                  className="mb-1 block text-xs font-medium text-muted-foreground"
                >
                  班级
                </label>
                <select
                  id="assign-class"
                  value={classId}
                  onChange={(e) => setClassId(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
                  required
                >
                  <option value="">选择班级...</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </div>
            )}

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
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
              />
            </div>

            {assignMsg && (
              <p className="text-xs text-muted-foreground" role="status">
                {assignMsg}
              </p>
            )}

            <Button type="submit" disabled={loading || !canSubmit} size="sm">
              {loading ? '布置中...' : '布置任务'}
            </Button>
          </form>
        </CardContent>
      )}
    </Card>
  );
}
