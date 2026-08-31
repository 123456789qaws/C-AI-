import 'server-only';

/**
 * Mock AI Provider —— 测试/开发用。
 * 返回固定（确定性）的 Socratic 判题 JSON 字符串，不发任何外部请求，
 * 便于单元测试与本地无密钥开发。
 */
import type { AIProvider } from './types';

/** 固定 Socratic 判题 JSON（text 字段内容），测试断言以此为准 */
export const MOCK_SOCRATIC_JSON = JSON.stringify({
  pass: true,
  confidence: 0.9,
  reply: '答得很好！那么顺着这个思路：如果这块内存分配后忘了释放，程序结束时会发生什么？',
  reason: 'mock provider: fixed Socratic response for tests',
});

export const mockAIProvider: AIProvider = {
  name: 'mock',

  async complete(): Promise<{ text: string; usage: { tokens: number } }> {
    return {
      text: MOCK_SOCRATIC_JSON,
      usage: { tokens: 0 },
    };
  },
};
