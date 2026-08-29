import 'server-only';

/**
 * Mock AI Provider - for testing and development
 * This provider returns deterministic responses without calling external APIs.
 */

export interface MockAIConfig {
  delay?: number;
  responseTemplate?: string;
}

export const mockAIProvider = {
  name: 'mock' as const,

  async generateResponse(prompt: string, config: MockAIConfig = {}): Promise<string> {
    const { delay = 100, responseTemplate = 'Mock response for: {prompt}' } = config;

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, delay));

    return responseTemplate.replace('{prompt}', prompt.slice(0, 100));
  },

  async judgeCode(code: string): Promise<{
    passed: boolean;
    score: number;
    feedback: string;
  }> {
    // Simple mock judge - passes if code contains 'function' or 'const'
    const hasCode = /function|const|let|var|=>/.test(code);
    return {
      passed: hasCode,
      score: hasCode ? 100 : 0,
      feedback: hasCode
        ? 'Mock judge: Code structure looks valid'
        : 'Mock judge: No code structure detected',
    };
  },
};

export type MockAIProvider = typeof mockAIProvider;
