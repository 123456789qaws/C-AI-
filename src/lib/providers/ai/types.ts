/**
 * AI Provider 抽象接口。
 * 所有 provider（deepseek-api / qwen-local / mock）必须实现该接口，
 * 上层业务代码只依赖此接口，不感知具体实现。
 */

export interface AICompleteOptions {
  model?: string;
  system?: string;
}

export interface AIUsage {
  tokens: number;
}

export interface AICompletion {
  text: string;
  usage: AIUsage;
}

export interface AIProvider {
  /** 提供商标识，与 env.AI_PROVIDER 对应，也用于 AiInteractionLog.model */
  readonly name: string;

  complete(
    prompt: string,
    opts?: AICompleteOptions
  ): Promise<{ text: string; usage: { tokens: number } }>;
}

/** 判题结果 —— 网关层统一返回结构 */
export interface JudgeResult {
  pass: boolean;
  confidence: number;
  reply: string;
  reason: string;
}
