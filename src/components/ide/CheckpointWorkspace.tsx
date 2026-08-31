'use client';

/**
 * CheckpointWorkspace —— 前端 Checkpoint 交互与解锁联动（todo 13）。
 *
 * 职责：
 *  - 展示当前关卡引导问题（guide_question）与关卡进度条（locked/current/passed）
 *  - 「请求验证」按钮 → POST /api/checkpoint/verify（后端硬锁 + 三级漏斗的唯一权威判定）
 *  - 验证结果以 Luna AI 气泡回显；过关后按顺序解锁下一编辑区（Monaco lockedRegions 更新 + 动画）
 *  - 越权编辑：MonacoWorkspace 前端回滚 + toast 提示；后端仍会独立二次校验（F12 无法绕过）
 *  - Hand in（提交作业）：全部关卡通过后才可点击
 *
 * ⚠️ 安全边界：本组件不保存任何答案/判题规则/隐藏测试 —— 关卡定义的真源在
 * 服务端 tasks/*.json（server-only loader），判题只发生在服务端。
 *
 * ⚠️ MVP 占位：task 元数据（id/title/引导问题/解锁区间）内联自 tasks/fib_L2.json 的
 * 公开字段。GET /api/tasks/:id 路由建成后（后续 todo），应改为服务端下发，删除此常量。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, Lock, LockOpen, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import MonacoWorkspace from '@/components/editor/MonacoWorkspace';
import LunaPanel from '@/components/luna/LunaPanel';
import type { LunaMessage } from '@/lib/mock/lunaMocks';

/* ------------------------------------------------------------------ */
/* MVP 任务元数据（镜像 tasks/fib_L2.json 公开字段，仅展示用途）        */
/* ------------------------------------------------------------------ */

interface CheckpointMeta {
  id: string;
  title: string;
  guideQuestion: string;
  /** 该关卡通过后解锁的编辑区间（1-based 闭区间，与 tasks JSON 的 unlock.editorRegion 一致） */
  unlockRegion: readonly [number, number];
}

const TASK_META: {
  id: string;
  title: string;
  description: string;
  checkpoints: CheckpointMeta[];
} = {
  id: 'fib_L2',
  title: '斐波那契数列（递归）',
  description: '实现 int fib(int n)：先想清递归终止条件，再写出完整递归函数并通过隐藏测试。',
  checkpoints: [
    {
      id: 'cp1',
      title: '递归边界条件',
      guideQuestion: '斐波那契递归的终止条件是什么？n 为 0 和 1 时分别应返回什么？',
      unlockRegion: [5, 15],
    },
    {
      id: 'cp2',
      title: '递归实现与隐藏测试',
      guideQuestion: '写出完整的 fib 递归函数，并跑通隐藏测试',
      unlockRegion: [16, 30],
    },
  ],
};

/**
 * 起始模板（30 行，与 fib_L2.json 的解锁区间对齐）：
 *  - 1-4 行：永远锁定（头文件与说明）
 *  - 5-15 行：cp1 通过后解锁 —— 学生实现 int fib(int n)
 *  - 16-30 行：cp2 通过后解锁 —— main 已在模板中（隐藏测试直接编译运行）
 * 作为 baseline 随验证请求提交，服务端据此做逐字符硬锁校验（todo 12）。
 */
const INITIAL_CODE = `#include <stdio.h>

/* ===== 关卡 1 · 递归边界条件 ===== */
/* cp1 通过后解锁第 5-15 行：实现 int fib(int n) */
int fib(int n) {
    /* 递归定义：fib(0)=0, fib(1)=1 */
    /* TODO: 在此实现 n<=1 的终止条件与递归调用 */
    return 0;
}

/* ===== 关卡 2 · 递归实现与隐藏测试 ===== */
/* cp2 通过后解锁第 16-30 行：main 已就绪，隐藏测试直接运行 */

int main() {
    int n;
    scanf("%d", &n);
    printf("%d\\n", fib(n));
    return 0;
}

/* ===== 扩展区（cp2 通过后解锁） ===== */
/* 可在此添加更多测试用例或优化实现 */

`;

/** 永远锁定的头部行（头文件与关卡说明，不归属任何 unlock 区间） */
const HEADER_LOCKED_REGION = { startLineNumber: 1, endLineNumber: 4 };

/**
 * MVP 学生标识：真实身份来自登录 JWT（todo 17 接入）；当前用固定演示 id，
 * 服务端 resolveStudentId 的 body.studentId 兜底路径（middleware 已放行）。
 */
const DEMO_STUDENT_ID = 'demo_student_001';

/* ------------------------------------------------------------------ */
/* 类型                                                               */
/* ------------------------------------------------------------------ */

interface VerifyResponse {
  passed: boolean;
  score?: number;
  escalated?: boolean;
  reason?: string;
  tampered?: boolean;
  violations?: number[];
  perGate?: Array<{
    type: string;
    passed: boolean;
    escalated?: boolean;
    reply?: string | null;
    reason?: string;
  }>;
  testHint?: string;
  nextCheckpointId?: string | null;
  unlockRegions?: number[][];
  error?: string;
  message?: string;
  hint?: string;
}

interface ToastItem {
  id: number;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
}

interface UnlockFlash {
  region: readonly [number, number];
  nonce: number;
}

/* ------------------------------------------------------------------ */
/* 组件                                                               */
/* ------------------------------------------------------------------ */

export default function CheckpointWorkspace() {
  const [code, setCode] = useState(INITIAL_CODE);
  /** 已通过关卡集合（前端只读解锁 UI 的依据；判题权威在服务端） */
  const [passed, setPassed] = useState<Record<string, boolean>>({});
  /** Luna 对话历史（气泡展示用） */
  const [messages, setMessages] = useState<LunaMessage[]>([]);
  /** 当前关卡的学生回答上下文（验证时拼接为 studentAnswer，过关后清空） */
  const chatContextRef = useRef<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTeacherView, setIsTeacherView] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [unlockFlash, setUnlockFlash] = useState<UnlockFlash | null>(null);
  const [lastResult, setLastResult] = useState<{
    passed: boolean;
    score: number;
    at: string;
  } | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const toastIdRef = useRef(0);
  const msgSeqRef = useRef(0);

  /* ---- 派生状态 ---- */

  const currentIndex = useMemo(
    () => TASK_META.checkpoints.findIndex((cp) => !passed[cp.id]),
    [passed]
  );
  const currentCheckpoint = currentIndex >= 0 ? TASK_META.checkpoints[currentIndex] : null;
  const allPassed = currentIndex < 0;

  /** 未解锁区间 = 永久锁定头部 + 所有未通过关卡的区间（通过后 Monaco 装饰自动消失） */
  const lockedRegions = useMemo(() => {
    const regions: { startLineNumber: number; endLineNumber: number }[] = [HEADER_LOCKED_REGION];
    for (const cp of TASK_META.checkpoints) {
      if (!passed[cp.id]) {
        regions.push({
          startLineNumber: cp.unlockRegion[0],
          endLineNumber: cp.unlockRegion[1],
        });
      }
    }
    return regions;
  }, [passed]);

  /* ---- 消息工具 ---- */

  const pushToast = useCallback((type: ToastItem['type'], title: string, message?: string) => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, type, title, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  }, []);

  const addAssistantMessage = useCallback((content: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `msg-ai-${Date.now()}-${++msgSeqRef.current}`,
        role: 'assistant',
        content,
        timestamp: new Date().toISOString(),
      },
    ]);
  }, []);

  const addUserMessage = useCallback((content: string) => {
    chatContextRef.current = [...chatContextRef.current, content];
    setMessages((prev) => [
      ...prev,
      {
        id: `msg-user-${Date.now()}-${++msgSeqRef.current}`,
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
      },
    ]);
  }, []);

  /* ---- 初始欢迎 + 引导问题 ---- */

  useEffect(() => {
    addAssistantMessage(
      `你好！我是 Luna，你的 C 语言学习助教。\n\n任务：${TASK_META.title}\n\n${currentCheckpoint?.guideQuestion ?? ''}`
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- 解锁动画 ---- */

  const flashUnlock = useCallback((region: readonly [number, number]) => {
    const nonce = Date.now();
    setUnlockFlash({ region, nonce });
    window.setTimeout(() => {
      setUnlockFlash((prev) => (prev && prev.nonce === nonce ? null : prev));
    }, 1400);
  }, []);

  /* ---- 验证 ---- */

  const handleVerify = useCallback(async () => {
    if (!currentCheckpoint || isLoading) return;

    setIsLoading(true);
    setLastResult(null);
    try {
      const res = await fetch('/api/checkpoint/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: TASK_META.id,
          checkpointId: currentCheckpoint.id,
          code,
          studentAnswer: chatContextRef.current.join('\n'),
          baseline: INITIAL_CODE, // 严格硬锁：锁定行必须与模板逐字符一致
          studentId: DEMO_STUDENT_ID, // MVP 兜底身份（todo 17 接入 JWT 后移除）
        }),
      });

      const data = (await res.json().catch(() => ({}))) as VerifyResponse;

      if (res.status === 403 && data.tampered) {
        // 后端硬锁拒收（前端回滚被 F12 绕过时兜底）
        pushToast(
          'error',
          '越权编辑被拒收',
          `锁定区行 ${data.violations?.join(', ') ?? '?'} 不允许修改`
        );
        addAssistantMessage(
          `⚠️ 后端检测到锁定区越权编辑${data.violations?.length ? `（第 ${data.violations.join('、')} 行）` : ''}，本次验证已拒收并标记异常。${data.reason ?? ''}`
        );
        return;
      }

      if (!res.ok) {
        const message =
          data.message ??
          (data.error === 'rate_limited'
            ? `AI 复核次数已达上限（每关 5 次），${data.hint ?? '请联系教师放行'}`
            : data.error === 'unauthorized'
              ? '未授权：缺少学生身份'
              : data.error === 'invalid_input'
                ? '请求参数不合法'
                : `请求失败（${res.status}）`);
        pushToast('error', '验证失败', message);
        addAssistantMessage(`⚠️ ${message}`);
        return;
      }

      if (data.passed) {
        // 过关：更新状态、解锁下一编辑区、展示 AI 反馈
        const passedCp = currentCheckpoint;
        setPassed((prev) => ({ ...prev, [passedCp.id]: true }));
        chatContextRef.current = [];
        setLastResult({
          passed: true,
          score: data.score ?? 1,
          at: new Date().toLocaleTimeString('zh-CN'),
        });

        const gateReplies = (data.perGate ?? [])
          .filter((g) => g.reply)
          .map((g) => g.reply as string);
        const summary = `✅ 通过「${passedCp.title}」${data.score !== undefined ? `（得分 ${data.score.toFixed(2)}）` : ''}\n${data.reason ?? ''}`;
        addAssistantMessage([summary, ...gateReplies].join('\n'));

        const next = TASK_META.checkpoints[currentIndex + 1];
        // 解锁动画打在本次通过的关卡区间上（它刚刚变为可编辑）
        flashUnlock(passedCp.unlockRegion);
        if (next) {
          addAssistantMessage(
            `🔓 第 ${passedCp.unlockRegion[0]}-${passedCp.unlockRegion[1]} 行已解锁！\n下一步关卡：${next.title}\n\n引导问题：${next.guideQuestion}`
          );
          pushToast(
            'success',
            `通过「${passedCp.title}」`,
            `第 ${passedCp.unlockRegion[0]}-${passedCp.unlockRegion[1]} 行已解锁`
          );
        } else {
          pushToast('success', '全部关卡通过！', '可以提交作业了');
        }
      } else {
        // 未过关：展示 AI 反馈/提示（testHint 只描述失败性质，绝不外泄期望值）
        const gateReplies = (data.perGate ?? [])
          .filter((g) => g.reply)
          .map((g) => g.reply as string);
        const parts: string[] = [`❌ 未通过「${currentCheckpoint.title}」`, data.reason ?? ''];
        if (data.testHint) parts.push(`💡 ${data.testHint}`);
        parts.push(...gateReplies);
        addAssistantMessage(parts.join('\n'));
        setLastResult({
          passed: false,
          score: data.score ?? 0,
          at: new Date().toLocaleTimeString('zh-CN'),
        });
        pushToast('error', '验证未通过', data.reason ?? '请参考 Luna 的反馈后重试');
      }
    } catch (err) {
      pushToast('error', '网络错误', err instanceof Error ? err.message : '无法连接验证服务');
      addAssistantMessage('⚠️ 网络异常，请稍后重试验证。');
    } finally {
      setIsLoading(false);
    }
  }, [
    code,
    currentCheckpoint,
    currentIndex,
    isLoading,
    addAssistantMessage,
    flashUnlock,
    pushToast,
  ]);

  /* ---- Luna 聊天（回答引导问题；提交验证走「请求验证」按钮） ---- */

  const handleLunaSend = useCallback(
    (content: string) => {
      addUserMessage(content);
      // 轻量即时反馈（不判题，判题由服务端负责）
      window.setTimeout(() => {
        addAssistantMessage(
          '已记录你的回答。想清楚后点击「请求验证」让 Luna 与隐藏测试一起检查。Luna 只问不给～'
        );
      }, 300);
    },
    [addUserMessage, addAssistantMessage]
  );

  /* ---- 越权编辑前端回滚提示 ---- */

  const handleLockViolation = useCallback(() => {
    pushToast('warning', '区域锁定', '该区域需通过对应检查点后才能编辑（已自动回滚）');
  }, [pushToast]);

  /* ---- Hand in ---- */

  const handleSubmit = useCallback(() => {
    if (!allPassed) {
      pushToast('warning', '未完成', '请先通过所有检查点');
      return;
    }
    setSubmitted(true);
    pushToast('success', '提交成功', '你的代码已提交，等待教师审核');
    addAssistantMessage('🎉 恭喜！你已完成所有检查点，代码已提交，教师将进行审核。');
  }, [allPassed, pushToast, addAssistantMessage]);

  /* ---- Toast 图标 ---- */

  const toastIcon = (type: ToastItem['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className="size-4 text-green-500" aria-hidden="true" />;
      case 'error':
        return <XCircle className="size-4 text-red-500" aria-hidden="true" />;
      case 'warning':
        return <AlertTriangle className="size-4 text-amber-500" aria-hidden="true" />;
      default:
        return <Info className="size-4 text-blue-500" aria-hidden="true" />;
    }
  };

  const formatRegion = (r: readonly [number, number]) => `${r[0]}-${r[1]}`;

  return (
    <div className="flex h-full w-full">
      {/* ================= 左：编辑器 + 关卡/引导/验证 ================= */}
      <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
        {/* ---- Monaco 工作区 ---- */}
        <Card className="flex min-h-0 flex-1 flex-col">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{TASK_META.title}</CardTitle>
            <label className="flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={isTeacherView}
                onChange={(e) => setIsTeacherView(e.target.checked)}
                className="h-4 w-4 rounded border-input bg-background focus:ring-2 focus:ring-ring"
              />
              教师视角 (可编辑锁定区域)
            </label>
          </CardHeader>

          {unlockFlash && (
            <div
              key={unlockFlash.nonce}
              className="unlock-flash flex items-center gap-2 border-b border-green-500/40 bg-green-500/10 px-4 py-2 text-sm text-green-500"
              role="status"
            >
              <LockOpen className="size-4" aria-hidden="true" />
              🔓 第 {formatRegion(unlockFlash.region)} 行已解锁，可以编辑了
            </div>
          )}

          <CardContent className="flex min-h-0 flex-1 flex-col">
            <MonacoWorkspace
              value={code}
              lockedRegions={lockedRegions}
              onChange={setCode}
              isTeacherView={isTeacherView}
              onLockViolation={handleLockViolation}
            />
          </CardContent>
        </Card>

        {/* ---- 关卡进度 + 引导问题 + 验证 + 提交 ---- */}
        <Card>
          <CardHeader>
            <CardTitle>检查点与引导问题</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 关卡进度条 */}
            <div className="flex flex-wrap items-center gap-2">
              {TASK_META.checkpoints.map((cp, idx) => {
                const isPassed = !!passed[cp.id];
                const isCurrent = cp.id === currentCheckpoint?.id;
                return (
                  <div
                    key={cp.id}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-all ${
                      isPassed
                        ? 'border-green-500/50 bg-green-500/10 text-green-500'
                        : isCurrent
                          ? 'border-ring bg-secondary text-foreground ring-1 ring-ring/50'
                          : 'border-border bg-muted/50 text-muted-foreground'
                    }`}
                    title={isPassed ? '已通过' : isCurrent ? '当前关卡' : '未解锁'}
                  >
                    {isPassed ? (
                      <CheckCircle2 className="size-4" aria-hidden="true" />
                    ) : isCurrent ? (
                      <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
                        {idx + 1}
                      </span>
                    ) : (
                      <Lock className="size-4" aria-hidden="true" />
                    )}
                    <span>{cp.title}</span>
                    {isPassed && (
                      <span className="text-xs opacity-70">
                        解锁 {formatRegion(cp.unlockRegion)}
                      </span>
                    )}
                  </div>
                );
              })}
              <span className="ml-auto text-xs text-muted-foreground">
                {allPassed ? '全部通过 ✓' : `当前：${currentCheckpoint?.title ?? ''}`}
              </span>
            </div>

            {/* 引导问题（只读展示） */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">引导问题</label>
              <textarea
                className="min-h-[64px] w-full rounded-md border border-input bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                value={currentCheckpoint?.guideQuestion ?? '全部关卡已通过，可以提交作业'}
                readOnly
                aria-label="当前引导问题"
              />
            </div>

            {/* 验证结果摘要 */}
            {lastResult && (
              <p
                className={`text-xs ${lastResult.passed ? 'text-green-500' : 'text-amber-500'}`}
                aria-live="polite"
              >
                最近一次验证（{lastResult.at}）：{lastResult.passed ? '通过' : '未通过'}（得分{' '}
                {lastResult.score.toFixed(2)}）
              </p>
            )}

            {/* 请求验证 + Hand in */}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={handleVerify}
                disabled={isLoading || !currentCheckpoint}
                className="min-w-32"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" /> 验证中…
                  </>
                ) : (
                  '请求验证'
                )}
              </Button>
              <Button
                variant="outline"
                onClick={handleSubmit}
                disabled={!allPassed || submitted}
                className="min-w-32"
              >
                {submitted ? '已提交 ✓' : '提交作业 (Hand in)'}
              </Button>
              {!allPassed && (
                <p className="text-xs text-muted-foreground">
                  {currentCheckpoint ? `通过「${currentCheckpoint.title}」后解锁下一区域` : ''}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ================= 右：Luna AI 助教 ================= */}
      <aside className="flex h-full w-[360px] flex-shrink-0 flex-col border-l border-border bg-card">
        <LunaPanel messages={messages} onSend={handleLunaSend} />
      </aside>

      {/* ================= Toast 通知 ================= */}
      <div className="fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="toast-in flex items-start gap-3 rounded-lg border border-border bg-card p-3 text-sm shadow-lg ring-1 ring-foreground/10"
            role="status"
          >
            <span className="mt-0.5 flex-shrink-0">{toastIcon(toast.type)}</span>
            <div className="min-w-0">
              <p className="font-medium text-foreground">{toast.title}</p>
              {toast.message && (
                <p className="mt-0.5 break-words text-xs text-muted-foreground">{toast.message}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
