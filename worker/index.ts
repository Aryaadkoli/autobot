// Standalone worker process, run with `npm run worker` in production; instrumentation.ts starts a copy in-process for local dev.
import "dotenv/config";
import { startWorkflowWorker } from "../core/workflow/worker-runtime";

startWorkflowWorker();
console.log("[worker] Listening for workflow-advance jobs...");
