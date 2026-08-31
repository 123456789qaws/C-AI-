import { NextResponse } from 'next/server';

import { aiProvider } from '@/lib/providers/ai';
import { SocraticSystemPrompt, buildJudgePrompt } from '@/lib/ai/prompt';

/**
 * POST /api/ai/socratic —— 苏格拉底式判题网关壳。
 *
 * ⚠️ 任务边界：
 * - 鉴权：占位（后续接入 JWT / 会话校验）
 * - 限流 / 熔断：占位（Task 15 实现，此处不实现）
 */

// TODO(auth): 接入真实鉴权（JWT），校验请求者身份并写入 AiInteractionLog.studentId
const AUTH_ENABLED = false; // 占位开关，当前直接放行

// TODO(task-15): 接入 rate limit / circuit breaker，此处仅为占位
const RATE_LIMIT_ENABLED = false;

const MAX_STUDENT_ANSWER_LEN = 4000;
const MAX_CODE_SNIPPET_LEN = 20000;
const MAX_HISTORY_LEN = 20;

interface SocraticRequestBody {
  checkpointId?: string;
  studentAnswer?: string;
  codeSnippet?: string;
  history?: Array<{ role?: string; content?: string }>;
}

/** 输入转义：去控制字符、去首尾空白、截断超长，防止提示词注入/超大请求 */
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

  // 限流占位
  if (RATE_LIMIT_ENABLED) {
    // TODO(task-15): 检查限流窗口，超限返回 429
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  let body: SocraticRequestBody;
  try {
    body = (await request.json()) as SocraticRequestBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const studentAnswer = escapeInput(body.studentAnswer ?? '', MAX_STUDENT_ANSWER_LEN);
  if (!studentAnswer) {
    return NextResponse.json({ error: 'studentAnswer_required' }, { status: 400 });
  }

  const codeSnippet = escapeInput(body.codeSnippet ?? '', MAX_CODE_SNIPPET_LEN);

  // 历史对话折叠进用户消息（转义 + 截断条数）
  const historyLines = (body.history ?? [])
    .slice(-MAX_HISTORY_LEN)
    .map(
      (h) => `${h.role === 'assistant' ? '助教' : '学生'}：${escapeInput(h.content ?? '', 2000)}`
    )
    .join('\n');

  const userPrompt = historyLines
    ? `${historyLines}\n\n${buildJudgePrompt(studentAnswer, codeSnippet)}`
    : buildJudgePrompt(studentAnswer, codeSnippet);

  try {
    const completion = await aiProvider.complete(userPrompt, {
      system: SocraticSystemPrompt,
    });

    const judge = parseJudgeResult(completion.text, 'provider output was not valid judge JSON');

    // TODO(task-15+): 持久化 AiInteractionLog / 更新 CheckpointProgress（依赖鉴权落地）

    return NextResponse.json({
      pass: judge.pass,
      confidence: judge.confidence,
      reply: judge.reply,
      reason: judge.reason,
    });
  } catch (err) {
    // 熔断/重试在 Task 15 实现；此处只做失败回执
    console.error('[socratic] provider error:', err);
    return NextResponse.json({ error: 'ai_provider_error' }, { status: 502 });
  }
}
