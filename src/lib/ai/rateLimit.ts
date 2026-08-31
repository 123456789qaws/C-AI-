/**
 * AI 网关限流 —— 每个 (studentId, checkpointId) 在窗口期内最多 AI_RATE_LIMIT 次调用。
 *
 * 实现：进程内存 Map，单实例部署够用。⚠️ 多实例 / Serverless 部署需替换为
 * Redis（INCR + EXPIRE）或数据库计数，否则各实例独立计数会被绕过。
 *
 * 可选落库（MVP 未启用）：每次放行时把 count 写入独立 RateLimit 表
 * （studentId + checkpointId + 窗口起始时间 唯一键），用于跨实例计数与审计。
 */
import 'server-only';

/** 每个 checkpoint 每窗口的最大 AI 调用次数（第 AI_RATE_LIMIT+1 次返回 429） */
export const AI_RATE_LIMIT = 5;

/** 限流窗口：1 小时 */
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

/** 内存计数桶 */
interface RateBucket {
  count: number;
  resetAt: number;
}

/** key = `${studentId}:${checkpointId}` */
const buckets = new Map<string, RateBucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/** 桶过多时惰性清理过期项，防止 Map 无限增长 */
function sweepExpired(now: number): void {
  if (buckets.size < 1024) {
    return;
  }
  buckets.forEach((bucket, key) => {
    if (now >= bucket.resetAt) {
      buckets.delete(key);
    }
  });
}

/**
 * 检查并消耗一次调用额度。
 * @param studentId 学生标识（MVP 由请求体传入；Task 17 改为从 JWT 解析）
 * @param checkpointId 关卡标识
 */
export function checkRateLimit(studentId: string, checkpointId: string): RateLimitResult {
  const now = Date.now();
  sweepExpired(now);

  const key = `${studentId}:${checkpointId}`;
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: AI_RATE_LIMIT - 1, retryAfterSeconds: 0 };
  }

  if (bucket.count >= AI_RATE_LIMIT) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }

  bucket.count += 1;
  return {
    allowed: true,
    remaining: AI_RATE_LIMIT - bucket.count,
    retryAfterSeconds: 0,
  };
}

/** 清空全部计数（仅测试用） */
export function resetRateLimitStateForTests(): void {
  buckets.clear();
}
