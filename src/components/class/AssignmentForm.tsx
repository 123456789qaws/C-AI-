'use client';

import { useState } from 'react';
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

interface AssignmentFormProps {
  classes: ClassOption[];
  onSubmit: (data: { taskId: string; classId: string; deadline: string | null }) => Promise<void>;
  loading?: boolean;
}

const TASK_OPTIONS: TaskOption[] = [
  { id: 'fib_L2', title: 'fib_L2 (递归 / Fibonacci)' },
  { id: 'linked_list_reverse', title: 'linked_list_reverse (链表反转)' },
];

export function AssignmentForm({ classes, onSubmit, loading }: AssignmentFormProps) {
  const [taskId, setTaskId] = useState('');
  const [classId, setClassId] = useState('');
  const [deadline, setDeadline] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskId || !classId) return;
    await onSubmit({
      taskId,
      classId,
      deadline: deadline ? new Date(deadline).toISOString() : null,
    });
    setTaskId('');
    setClassId('');
    setDeadline('');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">布置任务</CardTitle>
      </CardHeader>
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
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
              required
            >
              <option value="">选择任务...</option>
              {TASK_OPTIONS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
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

          <Button type="submit" disabled={loading || !taskId || !classId} size="sm">
            {loading ? '布置中...' : '布置任务'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
