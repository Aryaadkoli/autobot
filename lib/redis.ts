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

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redisConnection;
