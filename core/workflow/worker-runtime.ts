import { Worker, type Job } from "bullmq";
import { redisConnection } from "@/lib/redis";
import { wakeFromTimer } from "./engine";

// One consumer for the "workflow-advance" queue, shared by two entry
// points: worker/index.ts (a real standalone process — what
// docs/BLUEPRINT.md's architecture calls for, and what runs in
// production) and instrumentation.ts (starts the same consumer inside
// the Next.js dev server itself, so `npm run dev` alone is enough to see
// workflows actually advance locally — no second terminal required).
export function startWorkflowWorker(): Worker {
  const worker = new Worker(
    "workflow-advance",
    async (job: Job) => {
      const { instanceId } = job.data as { instanceId: string };
      await wakeFromTimer(instanceId);
    },
    { connection: redisConnection }
  );

  worker.on("failed", (job, err) => {
    console.error(`[workflow-worker] job ${job?.id} failed:`, err);
  });

  return worker;
}
