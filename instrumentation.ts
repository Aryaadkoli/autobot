// Starts the scheduled-campaign poller (a plain interval — no BullMQ job type fits a recurring sweep well) and a dev copy of the workflow-advance worker, so `npm run dev` alone advances workflows with no second terminal. Guards against register() firing more than once across dev hot-reloads with a global flag, same pattern as lib/db.ts's Prisma singleton.
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
