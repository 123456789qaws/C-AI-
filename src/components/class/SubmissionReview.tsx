'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock, CircleDashed, Eye, RotateCcw, ChevronDown } from 'lucide-react';

import { Button } from '@/components/ui/button';

/* ============================================================
 * SubmissionReview —— 教师审阅学生提交 + 打回重做（Bug5-submit）
 *   + 总得分概览（Bug3-scores）：每任务满分 100，submitted→100，
 *     否则按 passed/totalCheckpoints 比例四舍五入（API 下发 score，前端兜底同公式）；
 *     总分=sum，平均分=total/N（1 位小数，N=0 时 guard 为 —）。
 *   + 按任务审阅（Bug4-taskpage）：taskId 锁定单任务明细（GET 带 taskId 窄化，
 *     隐藏概览与筛选）；overviewOnly 只渲染总分概览（分数视图用，明细移至任务管理）。
 *   + 分数折叠（T6-scores）：概览表默认仅总分（学号/姓名/已布置/已提交/参与率/
 *     总分/平均分/详情Toggle），按行展开看该生各任务得分（单次 GET 复用，无 N+1）。
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
  score: number;
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

export default function SubmissionReview({
  classId,
  taskId,
  overviewOnly = false,
  onJumpToTask,
}: {
  classId: string;
  /** 锁定单任务审阅（任务管理展开态用）：GET 带 taskId 窄化，隐藏概览与筛选 */
  taskId?: string;
  /** 仅总分概览（分数视图用）：隐藏明细 drill-down */
  overviewOnly?: boolean;
  /** 概览表任务头点击跳转审阅（分数视图 → 任务管理） */
  onJumpToTask?: (taskId: string) => void;
}) {
  const [submissions, setSubmissions] = useState<StudentSubmission[]>([]);
  const [taskFilter, setTaskFilter] = useState<string>(taskId ?? 'all');
  const [loading, setLoading] = useState(true);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const toggleStudent = useCallback((studentId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return next;
    });
  }, []);

  const fetchSubmissions = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const url =
        `/api/submissions?classId=${encodeURIComponent(classId)}` +
        (taskId ? `&taskId=${encodeURIComponent(taskId)}` : '');
      const res = await fetch(url, {
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
  }, [classId, taskId]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  // Bug4-taskpage: taskId 锁定态与外部同步（切换任务时重置筛选/展开态）
  useEffect(() => {
    if (taskId) {
      setTaskFilter(taskId);
      setExpandedCode(null);
      setExpandedIds(new Set());
    }
  }, [taskId]);

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

  // Bug3-scores: 每任务得分 —— 优先 API 下发的 score，缺失时按同公式兜底
  const scoreOf = (t: TaskSubmission): number => {
    if (typeof t.score === 'number' && Number.isFinite(t.score)) return t.score;
    if (t.submitted) return 100;
    return t.totalCheckpoints > 0 ? Math.round((t.passed / t.totalCheckpoints) * 100) : 0;
  };

  // Bug3-scores: 按本班 enrollments（submissions 即本班学生）× 已布置任务聚合
  const assignedCount = taskOptions.length;
  const overviewRows = submissions.map((s) => {
    const byId = new Map(s.tasks.map((t) => [t.taskId, t]));
    const perTask = taskOptions.map((o) => {
      const t = byId.get(o.id);
      return t ? scoreOf(t) : 0;
    });
    const submittedCount = s.tasks.filter((t) => t.submitted).length;
    const total = perTask.reduce((sum, v) => sum + v, 0);
    return {
      student: s,
      assigned: assignedCount,
      submittedCount,
      rateText: assignedCount > 0 ? `${Math.round((submittedCount / assignedCount) * 100)}%` : '—',
      perTask,
      total,
      avgText: assignedCount > 0 ? (total / assignedCount).toFixed(1) : '—',
    };
  });

  if (loading) {
    return <p className="py-8 text-center text-sm text-[#666666]">加载提交数据中...</p>;
  }

  if (submissions.length === 0) {
    return <p className="py-8 text-center text-sm text-[#666666]">暂无学生数据</p>;
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

      {/* Bug3-scores: 每学生总得分概览（单次 GET 聚合，无 N+1）—— taskId 锁定态隐藏 */}
      {/* T6-scores: 默认仅总分，按行展开看该生各任务明细（任务多时不横向撑爆） */}
      {!taskId && (
        <div className="space-y-2">
          <p className="text-xs text-[#999999]">
            总得分概览（每任务满分 100 · 总分=各任务得分之和 · 平均分=总分/已布置）
            {overviewOnly && ' · 点击行末展开查看该生各任务得分'}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" role="table" aria-label="学生总得分概览">
              <thead>
                <tr className="border-b border-[#dddddd]">
                  <th className="px-3 py-2 text-left font-medium text-[#999999]">学号</th>
                  <th className="px-3 py-2 text-left font-medium text-[#999999]">姓名</th>
                  <th className="px-3 py-2 text-center font-medium text-[#999999]">已布置</th>
                  <th className="px-3 py-2 text-center font-medium text-[#999999]">已提交</th>
                  <th className="px-3 py-2 text-center font-medium text-[#999999]">参与率</th>
                  <th className="px-3 py-2 text-center font-medium text-[#999999]">总分</th>
                  <th className="px-3 py-2 text-center font-medium text-[#999999]">平均分</th>
                  <th className="px-3 py-2 text-center font-medium text-[#999999]">详情</th>
                </tr>
              </thead>
              <tbody>
                {overviewRows.map((r) => {
                  const expanded = expandedIds.has(r.student.studentId);
                  const byId = new Map(r.student.tasks.map((t) => [t.taskId, t]));
                  return (
                    <Fragment key={r.student.studentId}>
                      <tr className="border-b border-[#dddddd]/50 hover:bg-[#f7f7f7]">
                        <td className="px-3 py-2 font-mono text-black">{r.student.studentId}</td>
                        <td className="px-3 py-2 text-black">{r.student.studentName}</td>
                        <td className="px-3 py-2 text-center text-black">{r.assigned}</td>
                        <td className="px-3 py-2 text-center text-black">{r.submittedCount}</td>
                        <td className="px-3 py-2 text-center text-black">{r.rateText}</td>
                        <td className="px-3 py-2 text-center font-semibold text-black">
                          {r.total}
                        </td>
                        <td className="px-3 py-2 text-center text-black">{r.avgText}</td>
                        <td className="px-3 py-2 text-center">
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => toggleStudent(r.student.studentId)}
                            aria-expanded={expanded}
                            aria-label={`${expanded ? '收起' : '展开'} ${r.student.studentName} 的各任务得分`}
                          >
                            <ChevronDown
                              className={`size-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
                            />
                            {expanded ? '收起' : '展开'}
                          </Button>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="border-b border-[#dddddd]/50 bg-[#fafafa]">
                          <td colSpan={8} className="px-3 py-2">
                            <ul
                              className="space-y-2"
                              aria-label={`${r.student.studentName} 各任务得分`}
                            >
                              {taskOptions.map((opt, i) => {
                                const t = byId.get(opt.id);
                                const v = r.perTask[i] ?? 0;
                                const meta = t ? STATUS_META[t.status] : STATUS_META.not_started;
                                const rowKey = `${r.student.studentId}::${opt.id}`;
                                const codeKey = rowKey;
                                return (
                                  <li
                                    key={rowKey}
                                    className="flex flex-wrap items-center gap-2 rounded-none border border-[#dddddd] bg-white px-3 py-2"
                                  >
                                    <span
                                      className="min-w-0 flex-1 truncate text-sm text-black"
                                      title={opt.title}
                                    >
                                      {opt.title}
                                    </span>
                                    <span
                                      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium ${
                                        t?.submitted
                                          ? 'bg-black text-white'
                                          : 'border border-black/30 text-black'
                                      }`}
                                    >
                                      {v} 分
                                    </span>
                                    <span
                                      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium ${meta.className}`}
                                    >
                                      {meta.label}
                                    </span>
                                    {t && (
                                      <span className="text-xs text-[#999999]">
                                        {t.passed}/{t.totalCheckpoints} 关 · {t.attempts} 次尝试
                                      </span>
                                    )}
                                    {onJumpToTask && (
                                      <Button
                                        variant="ghost"
                                        size="xs"
                                        onClick={() => onJumpToTask(opt.id)}
                                        aria-label={`跳转审阅 ${opt.title}`}
                                      >
                                        跳转任务审阅
                                      </Button>
                                    )}
                                    {t?.lastCode && (
                                      <Button
                                        variant="ghost"
                                        size="xs"
                                        onClick={() =>
                                          setExpandedCode(expandedCode === codeKey ? null : codeKey)
                                        }
                                        aria-label={`查看 ${r.student.studentName} 的代码快照`}
                                      >
                                        <Eye className="size-3 mr-1" />
                                        代码
                                      </Button>
                                    )}
                                    {t &&
                                      (t.status !== 'not_started' ||
                                        t.attempts > 0 ||
                                        t.submitted) && (
                                        <Button
                                          variant="ghost"
                                          size="xs"
                                          disabled={rejecting === rowKey}
                                          onClick={() =>
                                            handleReject(
                                              r.student.studentId,
                                              r.student.studentName,
                                              t
                                            )
                                          }
                                          aria-label={`打回 ${r.student.studentName} 的 ${t.taskTitle}`}
                                        >
                                          <RotateCcw className="size-3 mr-1" />
                                          {rejecting === rowKey ? '打回中...' : '打回重做'}
                                        </Button>
                                      )}
                                    {expandedCode === codeKey && t?.lastCode && (
                                      <pre className="mt-1 max-h-64 w-full overflow-auto whitespace-pre-wrap break-words rounded-none border border-[#dddddd] bg-[#f7f7f7] p-3 font-mono text-xs text-black">
                                        {t.lastCode}
                                        {t.lastCodeAt && (
                                          <span className="mt-2 block text-[#999999]">
                                            快照时间：
                                            {new Date(t.lastCodeAt).toLocaleString('zh-CN')}
                                          </span>
                                        )}
                                      </pre>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bug4-taskpage: taskId 锁定态隐藏筛选（已窄化到单任务）；概览态隐藏筛选 */}
      {!taskId && !overviewOnly && taskOptions.length > 1 && (
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

      {/* Bug4-taskpage: 概览态隐藏明细 drill-down（明细只在任务管理按任务审阅） */}
      {!overviewOnly && (
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
                            onClick={() =>
                              setExpandedCode(expandedCode === codeKey ? null : codeKey)
                            }
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
                            onClick={() =>
                              handleReject(student.studentId, student.studentName, task)
                            }
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
      )}
      {!overviewOnly && (
        <p className="text-xs text-[#999999]">
          打回后将清除该学生此任务的全部关卡进度与提交标记，学生刷新后可重新闯关。
        </p>
      )}
    </div>
  );
}
