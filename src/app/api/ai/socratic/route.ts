import { NextResponse } from 'next/server';

import { aiProvider } from '@/lib/providers/ai';
import { mockAIProvider } from '@/lib/providers/ai/mock';
import { SocraticSystemPrompt } from '@/lib/ai/prompt';
import { buildSocraticContext } from '@/lib/ai/context';
import { checkRateLimit } from '@/lib/ai/rateLimit';
import { sanitizePrompt, redactSecrets, logAiUsage, enforceSocraticHardRule } from '@/lib/ai/guard';

/**
 * POST /api/ai/socratic —— 苏格拉底式判题网关。
 *
 * 安全层（Task 15）：
 * - 限流：每个 (studentId, checkpointId) 每窗口最多 AI_RATE_LIMIT 次调用，
 *   超限返回 429 + 「请联系教师放行」提示
 * - 熔断：真实 provider 连续 3 次失败后降级为 mock，成功一次自动复位
 * - 注入过滤：sanitizePrompt 清理控制字符与注入特征串
 * - 日志脱敏：redactSecrets 处理错误日志，绝不回传密钥
 * - token 记账：logAiUsage 累计用量
 *
 * Socratic 追问（Task 16）：
 * - 接受可选 judgeResult / valgrindHint / checkpointMeta / aiFollowup
 * - RE + 内存线索 → buildSocraticContext 注入脱敏崩溃摘要，引导模型追问定位
 * - 回复经 enforceSocraticHardRule 兜底：完整函数体（>5 行）绝不流到学生侧
 *
 * ⚠️ 鉴权仍为占位（Task 17 接入 JWT）；MVP 阶段 studentId 取自请求体，
 * 缺省 'anonymous'。接入 JWT 后请删除该字段直读逻辑。
 */

// TODO(auth): 接入真实鉴权（JWT），校验请求者身份并写入 AiInteractionLog.studentId
const AUTH_ENABLED = false; // 占位开关，当前直接放行

/** 熔断阈值：真实 provider 连续失败该次数后，降级为 mock */
const CIRCUIT_OPEN_THRESHOLD = 3;

const MAX_STUDENT_ANSWER_LEN = 4000;
const MAX_CODE_SNIPPET_LEN = 20000;
const MAX_HISTORY_LEN = 20;
const MAX_STUDENT_ID_LEN = 128;

/**
 * 熔断器状态（模块级，进程内）：真实 provider 连续失败计数。
 * 达到阈值后本次请求直接走 mock，后续请求也跳过真实 provider，
 * 直到一次成功将计数复位。
 */
let consecutiveProviderFailures = 0;

interface SocraticRequestBody {
  checkpointId?: string;
  /** MVP：前端显式传入学生标识；Task 17 改为从 JWT 解析 */
  studentId?: string;
  studentAnswer?: string;
  codeSnippet?: string;
  history?: Array<{ role?: string; content?: string }>;
  /** 可选：上次判题结果（status RE 时可能注入崩溃线索，用于苏格拉底追问） */
  judgeResult?: {
    status?: string;
    stderr?: string;
    valgrind?: string;
  };
  /** 可选：valgrind 提示开关（疑似内存问题） */
  valgrindHint?: boolean;
  /** 可选：on_fail.ai_followup —— 教师/系统追加追问 */
  aiFollowup?: string;
  /** 可选：checkpoint 元信息（memoryTask 内存专题等） */
  checkpointMeta?: { title?: string; memoryTask?: boolean };
}

/** 输入转义：去控制字符、去首尾空白、截断超长（代码片段不做注入过滤，防误伤源码） */
function escapeInput(input: string, maxLen: number): string {
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLen);
}

/** 从模型文本中稳健地解析出 {pass,confidence,reply,reason}，失败时降级 */
function parseJudgeResult(
  text: string,
  fallbackReason: string
): { pass: boolean; confidence: number; reply: string; reason: string } {
  const candidates: string[] = [text];

  // 模型可能用 ```json ... ``` 包裹，或夹杂前后缀文字
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    candidates.push(fenced[1].trim());
  }
  const firstBrace = text.match(/\{[\s\S]*\}/);
  if (firstBrace?.[0]) {
    candidates.push(firstBrace[0]);
  }

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') {
        const obj = parsed as Record<string, unknown>;
        if (
          typeof obj.pass === 'boolean' &&
          typeof obj.reply === 'string' &&
          obj.reply.length > 0
        ) {
          const confidence =
            typeof obj.confidence === 'number' && Number.isFinite(obj.confidence)
              ? Math.min(1, Math.max(0, obj.confidence))
              : 0.5;
          const reason = typeof obj.reason === 'string' ? obj.reason : fallbackReason;
          return { pass: obj.pass, confidence, reply: obj.reply, reason };
        }
      }
    } catch {
      // 尝试下一个候选
    }
  }

  // 解析失败降级：不通过，把模型原文作为回复
  return {
    pass: false,
    confidence: 0,
    reply: text.trim().slice(0, 2000) || '（模型未返回有效内容）',
    reason: fallbackReason,
  };
}

export async function POST(request: Request) {
  // 鉴权占位
  if (AUTH_ENABLED) {
    // TODO(auth): 校验 JWT，失败返回 401
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: SocraticRequestBody;
  try {
    body = (await request.json()) as SocraticRequestBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  // 学生身份：MVP 从请求体读取（Task 17 接入 JWT 后改为从 token 解析），缺省 anonymous
  const studentId = escapeInput(body.studentId ?? '', MAX_STUDENT_ID_LEN) || 'anonymous';
  const checkpointId = escapeInput(body.checkpointId ?? '', 256) || 'unknown';

  // 注入过滤 + 转义 + 截断
  const studentAnswer = sanitizePrompt(body.studentAnswer ?? '')
    .trim()
    .slice(0, MAX_STUDENT_ANSWER_LEN);
  if (!studentAnswer) {
    return NextResponse.json({ error: 'studentAnswer_required' }, { status: 400 });
  }

  // 每 checkpoint 限流：第 AI_RATE_LIMIT+1 次调用返回 429，提示联系教师
  const rate = checkRateLimit(studentId, checkpointId);
  if (!rate.allowed) {
    return NextResponse.json(
      {
        error: 'rate_limited',
        retryAfterSeconds: rate.retryAfterSeconds,
        hint: '请联系教师放行',
      },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
    );
  }

  const codeSnippet = escapeInput(body.codeSnippet ?? '', MAX_CODE_SNIPPET_LEN);

  // 可选：on_fail.ai_followup 追加追问（注入过滤 + 截断）
  const aiFollowup = sanitizePrompt(body.aiFollowup ?? '')
    .trim()
    .slice(0, 2000);

  // 可选：上次判题结果 —— 脱敏 + 截断。
  // 注意：valgrind 原始输出绝不直接进模型，context.ts 只抽取 1-2 行摘要。
  const judgeResult = body.judgeResult
    ? {
        status: escapeInput(body.judgeResult.status ?? '', 16),
        stderr: escapeInput(body.judgeResult.stderr ?? '', 4000),
        valgrind: escapeInput(body.judgeResult.valgrind ?? '', 20000),
      }
    : undefined;

  const valgrindHint = body.valgrindHint === true;
  const checkpointMeta = body.checkpointMeta
    ? {
        title: escapeInput(body.checkpointMeta.title ?? '', 256),
        memoryTask: body.checkpointMeta.memoryTask === true,
      }
    : undefined;

  // 历史对话折叠进用户消息（注入过滤 + 转义 + 截断条数）
  const historyLines = (body.history ?? [])
    .slice(-MAX_HISTORY_LEN)
    .map(
      (h) =>
        `${h.role === 'assistant' ? '助教' : '学生'}：${sanitizePrompt(h.content ?? '')
          .trim()
          .slice(0, 2000)}`
    )
    .join('\n');

  // 苏格拉底上下文：含 RE 崩溃线索（脱敏）与 ai_followup 追加追问
  const socraticContext = buildSocraticContext({
    studentAnswer,
    codeSnippet,
    judgeResult,
    valgrindHint,
    checkpointMeta,
    aiFollowup,
  });

  const userPrompt = historyLines ? `${historyLines}\n\n${socraticContext}` : socraticContext;

  // 熔断器：连续失败达到阈值时跳过真实 provider，直接走 mock 兜底
  let completion: { text: string; usage: { tokens: number } };
  let providerUsed: string;
  try {
    if (consecutiveProviderFailures >= CIRCUIT_OPEN_THRESHOLD) {
      completion = await mockAIProvider.complete('circuit-open fallback');
      providerUsed = mockAIProvider.name;
      console.warn('[socratic] circuit open, serving mock response');
    } else {
      completion = await aiProvider.complete(userPrompt, {
        system: SocraticSystemPrompt,
      });
      providerUsed = aiProvider.name;
    }
    consecutiveProviderFailures = 0; // 成功即复位熔断计数
  } catch (err) {
    consecutiveProviderFailures += 1;
    // 日志脱敏：绝不把密钥/原文写进日志
    console.error(
      '[socratic] provider error:',
      redactSecrets(err instanceof Error ? err.message : String(err))
    );
    if (consecutiveProviderFailures >= CIRCUIT_OPEN_THRESHOLD) {
      // 第 3 次连续失败：触发熔断，本次降级为 mock
      completion = await mockAIProvider.complete('circuit-breaker fallback');
      providerUsed = mockAIProvider.name;
      console.warn('[socratic] circuit breaker tripped, fallback to mock');
    } else {
      return NextResponse.json({ error: 'ai_provider_error' }, { status: 502 });
    }
  }

  const judge = parseJudgeResult(completion.text, 'provider output was not valid judge JSON');

  // 网关兜底：模型违规输出完整函数体（>5 行代码）时，替换为引导式提问
  const reply = enforceSocraticHardRule(judge.reply);

  // token 记账（进程内累计；Task 17 后可落 AiInteractionLog.tokens）
  logAiUsage({ provider: providerUsed, tokens: completion.usage.tokens, checkpointId });

  // TODO(task-17): 持久化 AiInteractionLog / 更新 CheckpointProgress（依赖鉴权落地）

  return NextResponse.json({
    pass: judge.pass,
    confidence: judge.confidence,
    reply,
    reason: judge.reason,
    provider: providerUsed,
    remaining: rate.remaining,
  });
}
