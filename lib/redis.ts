import IORedis from "ioredis";

// Singleton-guarded the same way lib/db.ts guards the Prisma client (avoids exhausting connections on Next.js hot-reload).
const globalForRedis = globalThis as unknown as { redis?: IORedis };

// maxRetriesPerRequest: null is required by BullMQ — it uses blocking
// commands that must be allowed to wait indefinitely.
export const redisConnection =
  globalForRedis.redis ??
  new IORedis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", {
    maxRetriesPerRequest: null,
  });

// An `error` event with no listener is fatal to Node (caused an uncaught EPIPE during `npm run build` with Redis down) — log instead of crashing.
redisConnection.on("error", (err) => {
  console.error("[redis] connection error:", err.message);
});

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redisConnection;
