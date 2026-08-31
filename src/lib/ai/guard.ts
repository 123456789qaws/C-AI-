/**
 * AI 安全护栏 —— 提示词注入过滤、密钥脱敏、token 记账。
 * 纯函数 + 进程内状态，仅服务端使用（由 socratic route 消费）。
 */

/** 提示词注入特征串（小写匹配，命中即整段删除） */
export const INJECTION_PATTERNS: string[] = [
  'ignore previous',
  'ignore all previous',
  'ignore the above',
  'system prompt',
  '忽略之前',
  '忽略以上',
  '忽略上述',
  'system:',
  'assistant:',
];

const INJECTION_RE = new RegExp(
  INJECTION_PATTERNS.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'gi'
);

/**
 * 输入消毒：
 * 1. 去除控制字符（\u0000-\u0008 等，防提示词走私）
 * 2. 过滤注入特征串（替换为空串）
 */
export function sanitizePrompt(input: string): string {
  if (!input) {
    return '';
  }
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(INJECTION_RE, '');
}

/**
 * 密钥脱敏 —— 用于日志/错误消息，防止 API key 泄露：
 * - sk- 开头密钥（OpenAI/DeepSeek 风格）→ sk-***
 * - key/token/secret/password/authorization 等赋值 → 值替换为 ***
 */
export function redactSecrets(text: string): string {
  if (!text) {
    return text;
  }
  return text
    .replace(/\bsk-[A-Za-z0-9_-]{4,}/g, 'sk-***')
    .replace(
      /((?:api[_-]?key|apikey|secret|token|password|authorization|bearer)\s*[=:]\s*)[^\s,"']+/gi,
      '$1***'
    );
}

// —— token 记账（进程内累计，供成本核算） ——
let totalTokens = 0;

export interface AiUsageEntry {
  provider: string;
  tokens: number;
  checkpointId?: string;
}

/**
 * 累计 token 用量并打点日志。
 * 注意：日志不含 studentId / 提示词原文，避免泄露隐私与密钥。
 * 可选落库（Task 17 后）：写入 AiInteractionLog.tokens 或独立计费表。
 */
export function logAiUsage(entry: AiUsageEntry): number {
  totalTokens += entry.tokens;
  console.info('[ai] token usage', {
    provider: entry.provider,
    tokens: entry.tokens,
    totalTokens,
    checkpointId: entry.checkpointId,
  });
  return totalTokens;
}

/** 当前累计 token（测试/监控用） */
export function getTotalTokens(): number {
  return totalTokens;
}
