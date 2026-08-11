import { Queue } from "bullmq";
import { redisConnection } from "@/lib/redis";

// One queue for every time-based wakeup a workflow instance needs: a
// "wait" step's timer, or a retry after the gatekeeper deferred a send
// (quiet hours / daily cap / a higher-priority flow). The worker
// (worker/index.ts, or the in-process copy in instrumentation.ts for dev)
// consumes this and calls core/workflow/engine.ts's wakeFromTimer().
export const advanceQueue = new Queue("workflow-advance", {
  connection: redisConnection,
});

export function advanceJobId(instanceId: string, stepId: string): string {
  // Deterministic job id so a re-scheduled wakeup for the same
  // instance+step replaces the old one instead of piling up duplicates.
  return `advance:${instanceId}:${stepId}`;
}
