import { prisma } from "@/lib/db";
import { redisConnection } from "@/lib/redis";

// Deliberately public — no requireSession(). An uptime monitor or a
// quick manual check after a deploy needs to hit this without a login,
// and it never returns anything sensitive (no stack traces, no
// internal hostnames) — just whether the app's two real dependencies
// are reachable.
export const dynamic = "force-dynamic";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out")), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

export async function GET() {
  const [dbResult, redisResult] = await Promise.allSettled([
    withTimeout(prisma.$queryRaw`SELECT 1`, 2000),
    withTimeout(redisConnection.ping(), 2000),
  ]);

  const checks = {
    database: dbResult.status === "fulfilled" ? "ok" : "down",
    redis: redisResult.status === "fulfilled" ? "ok" : "down",
  } as const;

  const healthy = checks.database === "ok" && checks.redis === "ok";

  return Response.json(
    { status: healthy ? "ok" : "degraded", checks, timestamp: new Date().toISOString() },
    { status: healthy ? 200 : 503 }
  );
}
