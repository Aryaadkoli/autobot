import { redisConnection } from "./redis";

// A small fixed-window rate limiter backed by the same Redis instance
// BullMQ already uses — no new infra for this. Used to slow down
// credential-guessing against login, signup, and password-change, since
// those are the places an attacker gets to try a password (or probe
// whether an email is already registered) against something we already
// know is correct.
//
// Fixed-window (not sliding) is a deliberate simplicity trade-off: it can
// let slightly more than `limit` requests through right at a window
// boundary, but for "stop a brute-force script," precision to the second
// doesn't matter — only the order of magnitude does.
//
// Fail OPEN, with a short timeout, if Redis doesn't respond: the Redis
// client here is configured with `maxRetriesPerRequest: null` (required
// by BullMQ elsewhere in the app), which means a command queues and
// waits indefinitely rather than rejecting while the connection is down
// — without the timeout race below, a Redis blip would hang every login
// attempt forever, turning "brute-force protection" into "nobody can log
// in." A temporary loss of throttling during a rare Redis outage is a
// far better failure mode than that.
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
      // Don't block the caller on this — expiry only matters for the
      // *next* check, not this one, and it's the same fail-open
      // reasoning as above if it times out.
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
