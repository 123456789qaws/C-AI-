import 'server-only';

/**
 * Qwen 本地 Provider —— 调用本地/内网部署的 Qwen OpenAI 兼容服务
 * （Ollama / vLLM 等）。地址来自 env.QWEN_URL，绝不暴露给客户端。
 */
import { env } from '@/lib/env';
import type { AIProvider } from './types';

const DEFAULT_MODEL = 'qwen2.5-coder:7b';

interface QwenResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { total_tokens?: number };
}

export function createQwenProvider(): AIProvider {
  const baseUrl = env.QWEN_URL;

  return {
    name: 'qwen-local',

    async complete(prompt, opts = {}) {
      if (!baseUrl) {
        throw new Error('QWEN_URL is not set');
      }

      const endpoint = baseUrl.endsWith('/')
        ? `${baseUrl}chat/completions`
        : `${baseUrl}/chat/completions`;

      const messages: Array<{ role: string; content: string }> = [];
      if (opts.system) {
        messages.push({ role: 'system', content: opts.system });
      }
      messages.push({ role: 'user', content: prompt });

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: opts.model ?? DEFAULT_MODEL,
          messages,
          stream: false,
        }),
      });

      if (!res.ok) {
        throw new Error(`Qwen local API error: ${res.status} ${res.statusText}`);
      }

      const data = (await res.json()) as QwenResponse;
      const text = data.choices?.[0]?.message?.content ?? '';
      const tokens = data.usage?.total_tokens ?? 0;

      return { text, usage: { tokens } };
    },
  };
}
