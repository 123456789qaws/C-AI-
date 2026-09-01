'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, GripVertical } from 'lucide-react';

/* ============================================================
 * Types
 * ============================================================ */

interface CheckpointDraft {
  id: string;
  title: string;
  kind: 'ai' | 'code';
  guideQuestion: string;
  aiChain: string;
  rubric: string;
  initialCode: string;
  tests: string;
  allowAIGenerate: boolean;
}

interface TaskCreatorProps {
  onCreated?: (taskId: string) => void;
}

/* ============================================================
 * Helpers
 * ============================================================ */

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('luna-token');
}

let nextCpId = 1;
function makeCheckpointDraft(): CheckpointDraft {
  return {
    id: `cp-${Date.now()}-${nextCpId++}`,
    title: '',
    kind: 'ai',
    guideQuestion: '',
    aiChain: '',
    rubric: '',
    initialCode: '',
    tests: '',
    allowAIGenerate: false,
  };
}

/* ============================================================
 * TaskCreator Component
 * ============================================================ */

export default function TaskCreator({ onCreated }: TaskCreatorProps) {
  const [title, setTitle] = useState('');
  const [intro, setIntro] = useState('');
  const [checkpointMode, setCheckpointMode] = useState<'sequential' | 'free'>('sequential');
  const [checkpoints, setCheckpoints] = useState<CheckpointDraft[]>([makeCheckpointDraft()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const updateCheckpoint = useCallback((id: string, patch: Partial<CheckpointDraft>) => {
    setCheckpoints((prev) => prev.map((cp) => (cp.id === id ? { ...cp, ...patch } : cp)));
  }, []);

  const addCheckpoint = useCallback(() => {
    setCheckpoints((prev) => [...prev, makeCheckpointDraft()]);
  }, []);

  const removeCheckpoint = useCallback((id: string) => {
    setCheckpoints((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((cp) => cp.id !== id);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!title.trim()) {
      setError('请输入任务标题');
      return;
    }
    if (checkpoints.length === 0) {
      setError('至少需要一个关卡');
      return;
    }

    // Validate checkpoints
    for (let i = 0; i < checkpoints.length; i++) {
      const cp = checkpoints[i];
      if (!cp.title.trim()) {
        setError(`关卡 ${i + 1} 缺少标题`);
        return;
      }
      if (!cp.guideQuestion.trim()) {
        setError(`关卡 ${i + 1} 缺少引导问题`);
        return;
      }
    }

    setSubmitting(true);

    try {
      const token = getToken();
      if (!token) {
        setError('未登录');
        return;
      }

      // Build checkpoints array for the task
      const builtCheckpoints = checkpoints.map((cp, index) => {
        const base = {
          id: `cp${index + 1}`,
          title: cp.title,
          guide_question: cp.guideQuestion,
          kind: cp.kind,
          pass_threshold: 1.0,
          unlock: {
            editorRegion: [0, 50] as [number, number],
            hints: [] as string[],
          },
        };

        if (cp.kind === 'ai') {
          return {
            ...base,
            gates: [
              {
                type: 'ai_socratic' as const,
                rubric: cp.rubric || cp.guideQuestion,
                weight: 1.0,
              },
            ],
            aiChain: cp.aiChain
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean),
          };
        } else {
          return {
            ...base,
            gates: [
              {
                type: 'test_pass' as const,
                tests: cp.tests || '[]',
                weight: 1.0,
              },
            ],
            initialCode: cp.initialCode,
            tests: cp.tests,
            allowAIGenerateTests: cp.allowAIGenerate,
          };
        }
      });

      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          intro: intro.trim(),
          checkpointMode,
          checkpoints: builtCheckpoints,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? '创建失败');
      }

      const data = await res.json();
      setSuccess(`任务创建成功: ${data.task?.id ?? title}`);
      setTitle('');
      setIntro('');
      setCheckpoints([makeCheckpointDraft()]);
      onCreated?.(data.task?.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="text-base">创建新任务</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label
              htmlFor="task-title"
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              任务标题 *
            </label>
            <input
              id="task-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如: Fibonacci 递归实现"
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
              required
            />
          </div>

          {/* Intro */}
          <div>
            <label
              htmlFor="task-intro"
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              任务简介
            </label>
            <textarea
              id="task-intro"
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              placeholder="简要描述任务目标与学习要点..."
              rows={2}
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50 break-words"
            />
          </div>

          {/* Checkpoint Mode */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">关卡模式</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCheckpointMode('sequential')}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                  checkpointMode === 'sequential'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted'
                }`}
              >
                顺序解锁
              </button>
              <button
                type="button"
                onClick={() => setCheckpointMode('free')}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                  checkpointMode === 'free'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted'
                }`}
              >
                自由选择
              </button>
            </div>
          </div>

          {/* Checkpoints */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                关卡列表 ({checkpoints.length})
              </label>
              <Button type="button" variant="outline" size="xs" onClick={addCheckpoint}>
                <Plus className="size-3 mr-1" />
                添加关卡
              </Button>
            </div>

            {checkpoints.map((cp, index) => (
              <div
                key={cp.id}
                className="relative rounded-xl border border-border bg-muted/30 p-4 space-y-3 overflow-hidden"
              >
                {/* Header */}
                <div className="flex items-center gap-2">
                  <GripVertical className="size-4 text-muted-foreground/50" />
                  <span className="text-xs font-semibold text-muted-foreground">
                    关卡 {index + 1}
                  </span>
                  <select
                    value={cp.kind}
                    onChange={(e) =>
                      updateCheckpoint(cp.id, { kind: e.target.value as 'ai' | 'code' })
                    }
                    className="ml-auto rounded-md border border-border bg-background px-2 py-0.5 text-xs text-foreground outline-none focus:border-ring"
                  >
                    <option value="ai">AI 链</option>
                    <option value="code">代码题</option>
                  </select>
                  {checkpoints.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => removeCheckpoint(cp.id)}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  )}
                </div>

                {/* Title */}
                <input
                  type="text"
                  value={cp.title}
                  onChange={(e) => updateCheckpoint(cp.id, { title: e.target.value })}
                  placeholder="关卡标题"
                  className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
                />

                {/* Guide question */}
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">引导问题 *</label>
                  <textarea
                    value={cp.guideQuestion}
                    onChange={(e) => updateCheckpoint(cp.id, { guideQuestion: e.target.value })}
                    placeholder="向学生提出的引导问题..."
                    rows={2}
                    className="w-full resize-none rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50 break-words"
                  />
                </div>

                {/* AI-specific fields */}
                {cp.kind === 'ai' && (
                  <>
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">
                        AI 问题链 (每行一个问题)
                      </label>
                      <textarea
                        value={cp.aiChain}
                        onChange={(e) => updateCheckpoint(cp.id, { aiChain: e.target.value })}
                        placeholder={'问题1\n问题2\n问题3'}
                        rows={3}
                        className="w-full resize-none rounded-lg border border-border bg-background px-3 py-1.5 font-mono text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50 whitespace-pre-wrap break-all overflow-auto min-h-0"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">
                        评分标准 (Rubric)
                      </label>
                      <textarea
                        value={cp.rubric}
                        onChange={(e) => updateCheckpoint(cp.id, { rubric: e.target.value })}
                        placeholder="AI评判依据..."
                        rows={2}
                        className="w-full resize-none rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50 break-words"
                      />
                    </div>
                  </>
                )}

                {/* Code-specific fields */}
                {cp.kind === 'code' && (
                  <>
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">初始代码</label>
                      <textarea
                        value={cp.initialCode}
                        onChange={(e) => updateCheckpoint(cp.id, { initialCode: e.target.value })}
                        placeholder="#include &lt;stdio.h&gt;&#10;&#10;int main() {&#10;  // 学生从这里开始&#10;  return 0;&#10;}"
                        rows={6}
                        className="w-full resize-none rounded-lg border border-border bg-muted px-3 py-1.5 font-mono text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50 whitespace-pre-wrap break-all overflow-auto min-h-0"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">
                        测试样例 (JSON)
                      </label>
                      <textarea
                        value={cp.tests}
                        onChange={(e) => updateCheckpoint(cp.id, { tests: e.target.value })}
                        placeholder='[{"input": "3", "expected": "2"}]'
                        rows={3}
                        className="w-full resize-none rounded-lg border border-border bg-background px-3 py-1.5 font-mono text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50 whitespace-pre-wrap break-all overflow-auto min-h-0"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={cp.allowAIGenerate}
                        onChange={(e) =>
                          updateCheckpoint(cp.id, { allowAIGenerate: e.target.checked })
                        }
                        className="rounded border-border"
                      />
                      允许 AI 生成测试样例
                    </label>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Error / Success */}
          {error && (
            <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive break-words">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400 break-words">
              {success}
            </div>
          )}

          {/* Submit */}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? '创建中...' : '发布任务'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
