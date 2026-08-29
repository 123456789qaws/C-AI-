import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  AI_PROVIDER: z.enum(['deepseek-api', 'qwen-local', 'mock']).default('deepseek-api'),
  DEEPSEEK_API_KEY: z.string().optional(),
  QWEN_URL: z.string().optional(),
  JUDGE_MODE: z.enum(['auto', 'docker', 'local']).default('auto'),
  JUDGE_URL: z.string().optional(),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
});

export const env = envSchema.parse(process.env);

export type Env = z.infer<typeof envSchema>;
