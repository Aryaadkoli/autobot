import IORedis from "ioredis";

// One Redis connection for BullMQ queues/workers, singleton-guarded the
// same way lib/db.ts guards the Prisma client (avoids exhausting
// connections when Next.js hot-reloads in development).
const globalForRedis = globalThis as unknown as { redis?: IORedis };

// maxRetriesPerRequest: null is required by BullMQ — it uses blocking
// commands that must be allowed to wait indefinitely.
export const redisConnection =
  globalForRedis.redis ??
  new IORedis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", {
    maxRetriesPerRequest: null,
  });

// ioredis auto-reconnects on its own (default retryStrategy), but an
// `error` event with no listener at all is treated as fatal by Node —
// this showed up as real, reproducible noise (and in one production-mode
// test, an uncaught `write EPIPE`) whenever Redis was briefly unreachable
// (e.g. during `npm run build`, which imports every route including ones
// that touch this file, with no Redis running at all). A listener that
// just logs turns "briefly can't reach Redis" back into what it should
// be: a transient warning, not a crash.
redisConnection.on("error", (err) => {
  console.error("[redis] connection error:", err.message);
});

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redisConnection;
