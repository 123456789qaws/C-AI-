'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock, CircleDashed, Eye, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';

/* ============================================================
 * SubmissionReview —— 教师审阅学生提交 + 打回重做（Bug5-submit）
 *
 * 数据源：GET /api/submissions?classId=&taskId=（班级作用域，教师须拥有班级）
 * 打回：DELETE /api/submissions { studentId, taskId, classId }，
 *       清除该生该任务全部 CheckpointProgress（含 _submitted 标记），
 *       学生端刷新后徽标清除、可重新闯关。操作前 confirm 二次确认。
 * ============================================================ */

interface TaskSubmission {
  taskId: string;
  taskTitle: string;
  totalCheckpoints: number;
  passed: number;
  attempts: number;
  submitted: boolean;
  status: 'submitted' | 'in_progress' | 'not_started';
  lastCode: string | null;
  lastCodeAt: string | null;
}

interface StudentSubmission {
  studentId: string;
  studentName: string;
  tasks: TaskSubmission[];
}

const STATUS_META: Record<TaskSubmission['status'], { label: string; className: string }> = {
  submitted: { label: '已完成', className: 'bg-black text-white' },
  in_progress: { label: '进行中', className: 'border border-black/30 text-black' },
  not_started: { label: '未开始', className: 'bg-[#f7f7f7] text-[#999999]' },
};

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('luna-token');
}

export default function SubmissionReview({ classId }: { classId: string }) {
  const [submissions, setSubmissions] = useState<StudentSubmission[]>([]);
  const [taskFilter, setTaskFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const fetchSubmissions = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/submissions?classId=${encodeURIComponent(classId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSubmissions(data.submissions ?? []);
      } else {
        const err = await res.json().catch(() => ({}));
        setNotice({ type: 'err', text: err.error ?? `加载失败（${res.status}）` });
      }
    } catch {
      setNotice({ type: 'err', text: '网络错误，请重试' });
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  const handleReject = async (studentId: string, studentName: string, task: TaskSubmission) => {
    if (
      !confirm(
        `确定打回 ${studentName} 的「${task.taskTitle}」重做？将清除其全部进度（含提交标记）。`
      )
    ) {
      return;
    }
    const token = getToken();
    if (!token) {
      setNotice({ type: 'err', text: '登录已过期，请重新登录' });
      return;
    }
    const key = `${studentId}::${task.taskId}`;
    setRejecting(key);
    setNotice(null);
    try {
      const res = await fetch('/api/submissions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ studentId, taskId: task.taskId, classId }),
      });
      if (res.ok) {
        setNotice({
          type: 'ok',
          text: `已打回 ${studentName} 的「${task.taskTitle}」，可重新闯关`,
        });
        fetchSubmissions();
      } else {
        const err = await res.json().catch(() => ({}));
        setNotice({ type: 'err', text: err.error ?? `打回失败（${res.status}）` });
      }
    } catch {
      setNotice({ type: 'err', text: '网络错误，请重试' });
    } finally {
      setRejecting(null);
    }
  };

  // 任务筛选下拉的选项（去重）
  const taskOptions: Array<{ id: string; title: string }> = [];
  const seen = new Set<string>();
  for (const s of submissions) {
    for (const t of s.tasks) {
      if (!seen.has(t.taskId)) {
        seen.add(t.taskId);
        taskOptions.push({ id: t.taskId, title: t.taskTitle });
      }
    }
  }

  const visibleRows: Array<{ student: StudentSubmission; task: TaskSubmission }> = [];
  for (const s of submissions) {
    for (const t of s.tasks) {
      if (taskFilter !== 'all' && t.taskId !== taskFilter) continue;
      visibleRows.push({ student: s, task: t });
    }
  }

  if (loading) {
    return <p className="py-8 text-center text-sm text-[#666666]">加载提交数据中...</p>;
  }

  if (submissions.length === 0) {
    return <p className="py-8 text-center text-sm text-[#666666]">暂无学生提交数据</p>;
  }

  return (
    <div className="space-y-3">
      {notice && (
        <div
          className={`rounded-none px-3 py-2 text-sm ${
            notice.type === 'ok' ? 'bg-black text-white' : 'border border-black/20 text-black'
          }`}
          role="status"
        >
          {notice.text}
        </div>
      )}

      {taskOptions.length > 1 && (
        <div className="flex items-center gap-2">
          <label htmlFor="submission-task-filter" className="text-xs text-[#999999]">
            按任务筛选
          </label>
          <select
            id="submission-task-filter"
            value={taskFilter}
            onChange={(e) => setTaskFilter(e.target.value)}
            className="rounded-none border border-[#dddddd] bg-white px-2 py-1 text-sm text-black outline-none focus:border-black"
          >
            <option value="all">全部任务</option>
            {taskOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm" role="table">
          <thead>
            <tr className="border-b border-[#dddddd]">
              <th className="px-3 py-2 text-left font-medium text-[#999999]">学号</th>
              <th className="px-3 py-2 text-left font-medium text-[#999999]">姓名</th>
              <th className="px-3 py-2 text-left font-medium text-[#999999]">任务</th>
              <th className="px-3 py-2 text-center font-medium text-[#999999]">进度</th>
              <th className="px-3 py-2 text-center font-medium text-[#999999]">状态</th>
              <th className="px-3 py-2 text-right font-medium text-[#999999]">操作</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(({ student, task }) => {
              const meta = STATUS_META[task.status];
              const rowKey = `${student.studentId}::${task.taskId}`;
              const codeKey = `${student.studentId}::${task.taskId}`;
              return (
                <tr key={rowKey} className="border-b border-[#dddddd]/50 hover:bg-[#f7f7f7]">
                  <td className="px-3 py-2 font-mono text-black">{student.studentId}</td>
                  <td className="px-3 py-2 text-black">{student.studentName}</td>
                  <td
                    className="max-w-[180px] truncate px-3 py-2 text-black"
                    title={task.taskTitle}
                  >
                    {task.taskTitle}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-center text-xs text-[#666666]">
                    {task.passed}/{task.totalCheckpoints} 关 · {task.attempts} 次尝试
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium ${meta.className}`}
                    >
                      {task.status === 'submitted' ? (
                        <CheckCircle2 className="size-3" />
                      ) : task.status === 'in_progress' ? (
                        <Clock className="size-3" />
                      ) : (
                        <CircleDashed className="size-3" />
                      )}
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      {task.lastCode && (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => setExpandedCode(expandedCode === codeKey ? null : codeKey)}
                          aria-label={`查看 ${student.studentName} 的代码快照`}
                        >
                          <Eye className="size-3 mr-1" />
                          代码
                        </Button>
                      )}
                      {(task.status !== 'not_started' || task.attempts > 0 || task.submitted) && (
                        <Button
                          variant="ghost"
                          size="xs"
                          disabled={rejecting === rowKey}
                          onClick={() => handleReject(student.studentId, student.studentName, task)}
                          aria-label={`打回 ${student.studentName} 的 ${task.taskTitle}`}
                        >
                          <RotateCcw className="size-3 mr-1" />
                          {rejecting === rowKey ? '打回中...' : '打回重做'}
                        </Button>
                      )}
                    </div>
                    {expandedCode === codeKey && task.lastCode && (
                      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-none border border-[#dddddd] bg-[#f7f7f7] p-3 font-mono text-xs text-black">
                        {task.lastCode}
                        {task.lastCodeAt && (
                          <span className="mt-2 block text-[#999999]">
                            快照时间：{new Date(task.lastCodeAt).toLocaleString('zh-CN')}
                          </span>
                        )}
                      </pre>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[#999999]">
        打回后将清除该学生此任务的全部关卡进度与提交标记，学生刷新后可重新闯关。
      </p>
    </div>
  );
}
