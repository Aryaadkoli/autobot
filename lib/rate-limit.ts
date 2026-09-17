import { redisConnection } from "./redis";

// Fixed-window (not sliding) is a deliberate simplicity trade-off — lets slightly more than `limit` through at a window boundary, which doesn't matter for stopping brute-force scripts.
// Fails OPEN on a short timeout: the Redis client uses `maxRetriesPerRequest: null` (required by BullMQ), so without this timeout a Redis blip would hang every login attempt forever instead of just losing throttling temporarily.
const REDIS_TIMEOUT_MS = 1500;

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
  try {
    const redisKey = `ratelimit:${key}`;
    const count = await withTimeout(redisConnection.incr(redisKey));
    if (count === 1) {
      // Don't block the caller — expiry only matters for the next check, not this one.
      withTimeout(redisConnection.expire(redisKey, windowSeconds)).catch(() => {});
    }
    return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
  } catch (err) {
    console.error("[rate-limit] Redis unavailable, failing open:", (err as Error).message);
    return { allowed: true, remaining: limit };
  }
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Redis rate-limit check timed out")), REDIS_TIMEOUT_MS);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}
