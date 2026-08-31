import 'server-only';

/**
 * DeepSeek AI Provider —— 通过 OpenAI 兼容的 chat/completions 端点调用。
 * API Key 来自 env.DEEPSEEK_API_KEY，绝不暴露给客户端。
 */
import { env } from '@/lib/env';
import type { AIProvider } from './types';

const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions';
const DEFAULT_MODEL = 'deepseek-chat';

interface DeepSeekResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { total_tokens?: number };
}

export function createDeepSeekProvider(): AIProvider {
  const apiKey = env.DEEPSEEK_API_KEY;

  return {
    name: 'deepseek-api',

    async complete(prompt, opts = {}) {
      if (!apiKey) {
        throw new Error('DEEPSEEK_API_KEY is not set');
      }

      const messages: Array<{ role: string; content: string }> = [];
      if (opts.system) {
        messages.push({ role: 'system', content: opts.system });
      }
      messages.push({ role: 'user', content: prompt });

      const res = await fetch(DEEPSEEK_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: opts.model ?? DEFAULT_MODEL,
          messages,
          stream: false,
        }),
      });

      if (!res.ok) {
        throw new Error(`DeepSeek API error: ${res.status} ${res.statusText}`);
      }

      const data = (await res.json()) as DeepSeekResponse;
      const text = data.choices?.[0]?.message?.content ?? '';
      const tokens = data.usage?.total_tokens ?? 0;

      return { text, usage: { tokens } };
    },
  };
}
