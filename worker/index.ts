// Standalone worker process (docs/BLUEPRINT.md: "one Next.js app + one
// background worker process"). Run with `npm run worker` in production —
// it consumes the same "workflow-advance" BullMQ queue that
// instrumentation.ts also starts a copy of for local dev convenience.
import "dotenv/config";
import { startWorkflowWorker } from "../core/workflow/worker-runtime";

startWorkflowWorker();
console.log("[worker] Listening for workflow-advance jobs...");
