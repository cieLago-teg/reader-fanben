type Bucket = { tokens: number; lastRefill: number };

const buckets = new Map<string, Bucket>();

/**
 * 极简限流：单进程内存 token bucket。
 * 注意：在 serverless/多实例环境中不保证全局一致，但 MVP 足够。
 */
export function rateLimitOrThrow(key: string, limit: number, refillMs: number) {
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: limit, lastRefill: now };

  // refill
  const elapsed = now - b.lastRefill;
  if (elapsed > refillMs) {
    b.tokens = limit;
    b.lastRefill = now;
  }

  if (b.tokens <= 0) {
    throw new Error("请求过于频繁，请稍后再试");
  }

  b.tokens -= 1;
  buckets.set(key, b);
}

export function getClientIp(headers: Headers) {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return headers.get("x-real-ip") || "unknown";
}

