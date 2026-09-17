import { Queue } from "bullmq";
import { redisConnection } from "@/lib/redis";

// Every time-based wakeup (wait-step timer or a deferred-send retry) goes through this queue; worker/index.ts (or instrumentation.ts's dev copy) consumes it via engine.ts's wakeFromTimer().
export const advanceQueue = new Queue("workflow-advance", {
  connection: redisConnection,
});

export function advanceJobId(instanceId: string, stepId: string): string {
  // Deterministic job id so a re-scheduled wakeup for the same
  // instance+step replaces the old one instead of piling up duplicates.
  return `advance:${instanceId}:${stepId}`;
}
