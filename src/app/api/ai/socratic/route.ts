import { NextResponse } from 'next/server';

import { aiProvider } from '@/lib/providers/ai';
import { mockAIProvider } from '@/lib/providers/ai/mock';
import { SocraticSystemPrompt, buildJudgePrompt } from '@/lib/ai/prompt';
import { checkRateLimit } from '@/lib/ai/rateLimit';
import { sanitizePrompt, redactSecrets, logAiUsage } from '@/lib/ai/guard';

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

  const userPrompt = historyLines
    ? `${historyLines}\n\n${buildJudgePrompt(studentAnswer, codeSnippet)}`
    : buildJudgePrompt(studentAnswer, codeSnippet);

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

  // token 记账（进程内累计；Task 17 后可落 AiInteractionLog.tokens）
  logAiUsage({ provider: providerUsed, tokens: completion.usage.tokens, checkpointId });

  // TODO(task-17): 持久化 AiInteractionLog / 更新 CheckpointProgress（依赖鉴权落地）

  return NextResponse.json({
    pass: judge.pass,
    confidence: judge.confidence,
    reply: judge.reply,
    reason: judge.reason,
    provider: providerUsed,
    remaining: rate.remaining,
  });
}
