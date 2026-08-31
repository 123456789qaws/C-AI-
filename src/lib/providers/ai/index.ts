import 'server-only';

/**
 * AI Provider 工厂 —— 根据 env.AI_PROVIDER 选择实现：
 *   deepseek-api | qwen-local | mock
 * 模块加载时创建一次并复用（单例）。
 */
import { env } from '@/lib/env';
import type { AIProvider } from './types';
import { createDeepSeekProvider } from './deepseek';
import { createQwenProvider } from './qwen';
import { mockAIProvider } from './mock';

function createProvider(): AIProvider {
  switch (env.AI_PROVIDER) {
    case 'deepseek-api':
      return createDeepSeekProvider();
    case 'qwen-local':
      return createQwenProvider();
    case 'mock':
      return mockAIProvider;
    default: {
      const neverValue: never = env.AI_PROVIDER;
      throw new Error(`Unknown AI_PROVIDER: ${String(neverValue)}`);
    }
  }
}

export const aiProvider: AIProvider = createProvider();

export type { AIProvider, AICompleteOptions, AIUsage, AICompletion, JudgeResult } from './types';
