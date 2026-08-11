import { redisConnection } from "./redis";

// A small fixed-window rate limiter backed by the same Redis instance
// BullMQ already uses — no new infra for this. Used to slow down
// credential-guessing against login and password-change, since those are
// the two places an attacker gets to try a password against something we
// already know is correct.
//
// Fixed-window (not sliding) is a deliberate simplicity trade-off: it can
// let slightly more than `limit` requests through right at a window
// boundary, but for "stop a brute-force script," precision to the second
// doesn't matter — only the order of magnitude does.
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
  const redisKey = `ratelimit:${key}`;
  const count = await redisConnection.incr(redisKey);
  if (count === 1) {
    await redisConnection.expire(redisKey, windowSeconds);
  }
  return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
}
