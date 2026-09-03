import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import { aiProvider } from '@/lib/providers/ai';
import { mockAIProvider } from '@/lib/providers/ai/mock';
import { SocraticSystemPrompt, TeacherQaSystemPrompt } from '@/lib/ai/prompt';
import { buildSocraticContext } from '@/lib/ai/context';
import { checkRateLimit } from '@/lib/ai/rateLimit';
import { sanitizePrompt, redactSecrets, logAiUsage, enforceSocraticHardRule } from '@/lib/ai/guard';
import { verifyToken } from '@/lib/auth/jwt';
import { logInteraction } from '@/lib/logs/logger';

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
 * 身份与日志（Task 17/18）：
 * - Bearer(JWT) 优先解析学生身份，兜底 body.studentId，缺省 'anonymous'
 *   （本路由不在 middleware 保护名单内，故在路由内自行解析）
 * - 每次调用经 logInteraction 落库 AiInteractionLog（全字段，Task 18）
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
  /** MVP：前端显式传入学生标识；Task 17 接入 JWT 后改为从 token 解析 */
  studentId?: string;
  /** 所属任务（Task 18 日志落库用）；缺省 'unknown' */
  taskId?: string;
  studentAnswer?: string;
  /** Bug4-luna：教师问答的问题正文（studentAnswer 的别名，教师端发送 question） */
  question?: string;
  /**
   * Bug4-luna：教师预览问答标志。前端在教师视角（effectiveFullUnlock）置 true；
   * 服务端必须用 JWT role 二次校验 TEACHER/TA/ADMIN，否则 403。
   */
  teacherPreview?: boolean;
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

/** 身份解析：Bearer(JWT) 优先，MVP 兜底 body.studentId，缺省 'anonymous' */
function resolveStudentId(request: Request, body: SocraticRequestBody): string {
  const header = request.headers.get('authorization');
  if (header?.startsWith('Bearer ')) {
    const payload = verifyToken(header.slice('Bearer '.length).trim());
    if (payload) return payload.id;
  }
  return escapeInput(body.studentId ?? '', MAX_STUDENT_ID_LEN) || 'anonymous';
}

/** Bug4-luna：解析 JWT 身份（含 role），教师问答路径服务端二次校验用 */
function resolveIdentity(request: Request): { id: string; role: string } | null {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return verifyToken(header.slice('Bearer '.length).trim());
}

/** Bug4-luna：教师问答是否为特权角色 */
function isTeacherRole(role: string): boolean {
  return role === 'TEACHER' || role === 'TA' || role === 'ADMIN';
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

  // 学生身份：Bearer(JWT) 优先，MVP 从请求体读取（Task 17 已接入 JWT），缺省 anonymous
  const studentId = resolveStudentId(request, body);
  const taskId = escapeInput(body.taskId ?? '', 256) || 'unknown';
  const checkpointId = escapeInput(body.checkpointId ?? '', 256) || 'unknown';

  // —— Bug4-luna：教师预览问答路径（与学生 verify 流程完全隔离） ——
  // 前端教师视角（effectiveFullUnlock）置 teacherPreview=true 并发送 question；
  // 服务端以 JWT role 为唯一权威二次校验，学生冒充直接 403。
  if (body.teacherPreview === true) {
    const identity = resolveIdentity(request);
    if (!identity || !isTeacherRole(identity.role)) {
      return NextResponse.json({ error: 'forbidden_teacher_only' }, { status: 403 });
    }
    const question = sanitizePrompt(body.question ?? body.studentAnswer ?? '')
      .trim()
      .slice(0, MAX_STUDENT_ANSWER_LEN);
    if (!question) {
      return NextResponse.json({ error: 'question_required' }, { status: 400 });
    }
    // 独立限流桶（teacherId+taskId），与学生 5/checkpoint/h 互不占用
    const teacherRate = checkRateLimit(`teacher:${identity.id}`, taskId || checkpointId);
    if (!teacherRate.allowed) {
      return NextResponse.json(
        {
          error: 'rate_limited',
          retryAfterSeconds: teacherRate.retryAfterSeconds,
          hint: '提问过于频繁，请稍后再试',
        },
        { status: 429, headers: { 'Retry-After': String(teacherRate.retryAfterSeconds) } }
      );
    }
    const teacherCode = escapeInput(body.codeSnippet ?? '', MAX_CODE_SNIPPET_LEN);
    const teacherPrompt = [
      `【教师备课问答】任务：${taskId}，关卡：${checkpointId}。`,
      teacherCode
        ? `教师当前查看的代码（仅作上下文，绝不向学生侧回传）：\n\`\`\`c\n${teacherCode}\n\`\`\``
        : '',
      `教师提问：${question}`,
    ]
      .filter(Boolean)
      .join('\n\n');
    let teacherCompletion: { text: string; usage: { tokens: number } };
    let teacherProvider: string;
    try {
      if (consecutiveProviderFailures >= CIRCUIT_OPEN_THRESHOLD) {
        teacherCompletion = await mockAIProvider.complete('circuit-open fallback');
        teacherProvider = mockAIProvider.name;
      } else {
        teacherCompletion = await aiProvider.complete(teacherPrompt, {
          system: TeacherQaSystemPrompt,
        });
        teacherProvider = aiProvider.name;
      }
      consecutiveProviderFailures = 0;
    } catch (err) {
      consecutiveProviderFailures += 1;
      console.error(
        '[socratic] teacher provider error:',
        redactSecrets(err instanceof Error ? err.message : String(err))
      );
      if (consecutiveProviderFailures >= CIRCUIT_OPEN_THRESHOLD) {
        teacherCompletion = await mockAIProvider.complete('circuit-breaker fallback');
        teacherProvider = mockAIProvider.name;
      } else {
        return NextResponse.json({ error: 'ai_provider_error' }, { status: 502 });
      }
    }
    // 同遵守苏格拉底硬规则：>5 行完整函数绝不流出；隐藏测试本路由从不加载，无泄漏面
    const teacherReply = enforceSocraticHardRule(teacherCompletion.text.trim().slice(0, 4000));
    logAiUsage({ provider: teacherProvider, tokens: teacherCompletion.usage.tokens, checkpointId });
    // role=teacher + 独立 gateType，教师问答不混入学生 CheckpointProgress 与看板学生口径
    await logInteraction({
      studentId: identity.id,
      taskId,
      checkpointId,
      sessionId: randomUUID(),
      role: 'teacher',
      promptText: teacherPrompt.slice(0, 20000),
      aiReply: teacherReply,
      gateResult: 'passed',
      gateType: 'ai_teacher_qa',
      model: teacherProvider,
      tokens: teacherCompletion.usage.tokens,
      confidence: null,
      codeBefore: undefined,
      codeAfter: teacherCode.length > 0 ? teacherCode : undefined,
    });
    return NextResponse.json({
      reply: teacherReply,
      provider: teacherProvider,
      remaining: teacherRate.remaining,
      teacherPreview: true,
    });
  }

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

  // token 记账（进程内累计）
  logAiUsage({ provider: providerUsed, tokens: completion.usage.tokens, checkpointId });

  // Task 18: 交互日志落库（全字段）；DB 不可用时 logger 内部降级，不阻塞响应
  await logInteraction({
    studentId,
    taskId,
    checkpointId,
    sessionId: randomUUID(),
    role: 'assistant',
    promptText: userPrompt.slice(0, 20000),
    aiReply: reply,
    gateResult: judge.pass ? 'passed' : 'failed',
    gateType: 'ai_socratic',
    model: providerUsed,
    tokens: completion.usage.tokens,
    confidence: judge.confidence,
    codeBefore: undefined,
    codeAfter: codeSnippet.length > 0 ? codeSnippet : undefined,
  });

  return NextResponse.json({
    pass: judge.pass,
    confidence: judge.confidence,
    reply,
    reason: judge.reason,
    provider: providerUsed,
    remaining: rate.remaining,
  });
}
