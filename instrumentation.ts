// Starts two background loops once when the server boots:
// 1. The scheduled-campaign poller — a stand-in for a real queue-based
//    sweep (there's no recurring "check every N seconds" job type in
//    BullMQ that fits this well, so it stays a plain interval).
// 2. A copy of the workflow-advance worker (core/workflow/worker-runtime)
//    — the REAL worker process is worker/index.ts (run via `npm run
//    worker`, what production uses), but starting one here too means
//    `npm run dev` alone is enough to see workflows actually advance
//    locally, no second terminal required.
// Runs only in the Node.js runtime (not Edge), and guards against
// Next.js/Turbopack calling register() more than once (e.g. across dev
// hot-reloads) with a global flag, the same pattern lib/db.ts uses for
// the Prisma singleton.
const CHECK_INTERVAL_MS = Number(process.env.SCHEDULER_INTERVAL_MS) || 60_000;

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const g = globalThis as unknown as {
    __autobotSchedulerStarted?: boolean;
    __autobotWorkflowWorkerStarted?: boolean;
  };

  if (!g.__autobotSchedulerStarted) {
    g.__autobotSchedulerStarted = true;
    const { runDueScheduledCampaigns } = await import("./core/channels/campaign");
    setInterval(() => {
      runDueScheduledCampaigns().catch((e) => {
        console.error("[scheduler] error checking due campaigns:", e);
      });
    }, CHECK_INTERVAL_MS);
    console.log(
      `[scheduler] Started — checking for due scheduled campaigns every ${CHECK_INTERVAL_MS / 1000}s`
    );
  }

  if (!g.__autobotWorkflowWorkerStarted) {
    g.__autobotWorkflowWorkerStarted = true;
    const { startWorkflowWorker } = await import("./core/workflow/worker-runtime");
    startWorkflowWorker();
    console.log("[workflow-worker] Started (in-process, dev convenience copy of worker/index.ts)");
  }
}
