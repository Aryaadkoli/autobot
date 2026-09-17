import { Worker, type Job } from "bullmq";
import { redisConnection } from "@/lib/redis";
import { wakeFromTimer } from "./engine";

// Shared consumer for the "workflow-advance" queue: worker/index.ts runs it standalone in production; instrumentation.ts starts a copy in-process so `npm run dev` alone advances workflows locally.
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
