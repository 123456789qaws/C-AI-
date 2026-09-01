'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { Button } from '@/components/ui/button';
import CheckpointWorkspace from '@/components/ide/CheckpointWorkspace';
import { ArrowLeft } from 'lucide-react';

/* ============================================================
 * Types
 * ============================================================ */

interface TaskInfo {
  id: string;
  title: string;
  intro?: string;
  checkpointMode?: string;
}

/* ============================================================
 * Helpers
 * ============================================================ */

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('luna-token');
}

/* ============================================================
 * StudentTaskPage — wraps CheckpointWorkspace for a specific task
 * ============================================================ */

export default function StudentTaskPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const taskId = params.id as string;
  const classId = searchParams.get('classId');

  const [task, setTask] = useState<TaskInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!taskId) return;

    async function fetchTask() {
      const token = getToken();
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/tasks/${taskId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setTask(data.task);
        } else {
          // Fallback: task might not have API yet, use basic info
          setTask({ id: taskId, title: taskId });
        }
      } catch {
        setTask({ id: taskId, title: taskId });
      } finally {
        setLoading(false);
      }
    }

    fetchTask();
  }, [taskId]);

  if (loading) {
    return (
      <AuthGuard roles={['STUDENT']}>
        <div className="flex min-h-[50vh] items-center justify-center">
          <p className="text-sm text-muted-foreground">加载任务中...</p>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard roles={['STUDENT']}>
      <div className="flex flex-col h-full bg-background">
        {/* Header bar */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-2 bg-card">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => (classId ? router.push(`/classes/${classId}`) : router.push('/classes'))}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-foreground truncate">
              {task?.title ?? taskId}
            </h1>
            {task?.intro && <p className="text-xs text-muted-foreground truncate">{task.intro}</p>}
          </div>
          {user && <span className="text-xs text-muted-foreground">{user.name}</span>}
        </div>

        {/* IDE workspace */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <CheckpointWorkspace />
        </div>
      </div>
    </AuthGuard>
  );
}
