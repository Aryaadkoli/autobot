import type { EventType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { evaluateCondition } from "../tagging/rules";
import { WorkflowDefinitionSchema, type WorkflowDefinition, type Step } from "./schema";
import { parseDurationMs } from "./schema";
import { sendWorkflowStep } from "./send-step";
import { advanceQueue, advanceJobId } from "./queues";

// enroll(), advance(), handleEvent(), pivot() — the heart of the workflow
// engine (docs/BLUEPRINT.md core/workflow/engine.ts). Framework-free: no
// Next.js imports, callable from API routes and from the worker alike.

function getDefinition(workflow: { definition: unknown }): WorkflowDefinition {
  return WorkflowDefinitionSchema.parse(workflow.definition);
}

function getStep(def: WorkflowDefinition, stepId: string): Step {
  const step = def.steps[stepId];
  if (!step) throw new Error(`Unknown step "${stepId}"`);
  return step;
}

// Starts a contact on a workflow. Idempotent — re-enrolling a contact
// that already has an ACTIVE instance of this exact workflow returns the
// existing instance instead of starting a second, competing one.
export async function enroll(
  tenantId: string,
  workflowId: string,
  contactId: string
): Promise<string> {
  const existing = await prisma.sequenceInstance.findFirst({
    where: { tenantId, workflowId, contactId, status: "ACTIVE" },
  });
  if (existing) return existing.id;

  const instance = await prisma.sequenceInstance.create({
    data: { tenantId, workflowId, contactId, status: "ACTIVE", context: {} },
  });
  await advanceInstance(instance.id);
  return instance.id;
}

// Runs the instance forward from targetStepId (or its current position)
// until it hits a "wait" step (schedules a timer, returns), an "end" step
// (marks COMPLETED, returns), or a "send" step the gatekeeper deferred
// (schedules a retry timer, returns). "send"/"branch" steps chain
// synchronously in the same call — a workflow with no waits runs to
// completion in one advanceInstance() call, same as a Campaign send.
export async function advanceInstance(instanceId: string, targetStepId?: string): Promise<void> {
  const instance = await prisma.sequenceInstance.findUniqueOrThrow({
    where: { id: instanceId },
    include: { workflow: true, contact: true },
  });
  if (instance.status !== "ACTIVE") return; // pivoted/cancelled/completed elsewhere — nothing to do

  const def = getDefinition(instance.workflow);
  let stepId = targetStepId ?? instance.currentStepId ?? def.entry;
  let guard = 0;

  while (guard++ < 50) {
    const step = getStep(def, stepId);

    if (step.type === "send") {
      const outcome = await sendWorkflowStep({
        instance,
        contact: instance.contact,
        step,
        stepId,
      });
      if (outcome.outcome === "deferred") {
        await scheduleWake(instanceId, stepId, outcome.until);
        return;
      }
      stepId = step.next;
      continue;
    }

    if (step.type === "branch") {
      const attrs = {
        ...((instance.contact.attributes as Record<string, unknown>) ?? {}),
        ...((instance.context as Record<string, unknown>) ?? {}),
      };
      stepId = evaluateCondition(step.if, attrs) ? step.then : step.else;
      continue;
    }

    if (step.type === "wait") {
      const wakeAt = new Date(Date.now() + parseDurationMs(step.duration));
      await scheduleWake(instanceId, stepId, wakeAt, step.listen[0]?.event);
      return;
    }

    // end
    await prisma.sequenceInstance.update({
      where: { id: instanceId },
      data: { status: "COMPLETED", currentStepId: stepId, endedAt: new Date(), wakeAt: null, bullJobId: null },
    });
    return;
  }

  throw new Error(`Workflow ${instance.workflowId} looped >50 steps without reaching wait/end — check for a next/then/else cycle`);
}

async function scheduleWake(
  instanceId: string,
  stepId: string,
  wakeAt: Date,
  waitingFor?: EventType
): Promise<void> {
  const jobId = advanceJobId(instanceId, stepId);
  const job = await advanceQueue.add(
    "advance",
    { instanceId },
    { jobId, delay: Math.max(0, wakeAt.getTime() - Date.now()) }
  );
  await prisma.sequenceInstance.update({
    where: { id: instanceId },
    data: { currentStepId: stepId, wakeAt, waitingFor: waitingFor ?? null, bullJobId: job.id ?? null },
  });
}

// Called by the worker when a delayed job fires. Re-validates the
// instance is still ACTIVE and still actually sitting at the step the job
// was scheduled for — a stale job (superseded by an event that already
// moved the instance on) is a safe no-op rather than a double-advance.
export async function wakeFromTimer(instanceId: string): Promise<void> {
  const instance = await prisma.sequenceInstance.findUnique({
    where: { id: instanceId },
    include: { workflow: true },
  });
  if (!instance || instance.status !== "ACTIVE" || !instance.currentStepId) return;

  const def = getDefinition(instance.workflow);
  const step = def.steps[instance.currentStepId];
  if (!step) return;

  if (step.type === "wait") {
    await advanceInstance(instanceId, step.next);
  } else if (step.type === "send") {
    await advanceInstance(instanceId, instance.currentStepId); // retry the deferred send
  }
}

// Called whenever a behavior Event is recorded for a contact (a reply, a
// link click, an opt-out...) — checks every ACTIVE instance currently
// waiting on a step that listens for this event type, and pivots/jumps
// accordingly. Cheap: a contact rarely has more than one or two active
// flows at once.
export async function handleEvent(
  tenantId: string,
  contactId: string,
  eventType: EventType
): Promise<void> {
  const instances = await prisma.sequenceInstance.findMany({
    where: { tenantId, contactId, status: "ACTIVE" },
    include: { workflow: true },
  });

  for (const instance of instances) {
    if (!instance.currentStepId) continue;
    const def = getDefinition(instance.workflow);
    const step = def.steps[instance.currentStepId];
    if (!step || step.type !== "wait") continue;

    const rule = step.listen.find((l) => l.event === eventType);
    if (!rule) continue;

    await cancelPendingJob(instance.id, instance.currentStepId);

    if (rule.action === "pivot" && rule.subflow) {
      await pivot(tenantId, instance.id, contactId, rule.subflow);
    } else if (rule.action === "goto" && rule.step) {
      await advanceInstance(instance.id, rule.step);
    }
  }
}

async function cancelPendingJob(instanceId: string, stepId: string): Promise<void> {
  await advanceQueue.remove(advanceJobId(instanceId, stepId)).catch(() => {});
}

// Kills the current sequence and starts a sub-flow instead — e.g. a lead
// clicks the link mid-drip, so the marketing sequence stops and a "ready
// to order" sales sub-flow begins for the same contact.
export async function pivot(
  tenantId: string,
  instanceId: string,
  contactId: string,
  subflowName: string
): Promise<void> {
  const subflow = await prisma.workflow.findFirst({
    where: { tenantId, name: subflowName, status: "ACTIVE" },
    orderBy: { version: "desc" },
  });

  if (!subflow) {
    // Sub-flow isn't set up (or isn't ACTIVE) — end the pivot attempt
    // rather than silently pretending nothing happened.
    await prisma.sequenceInstance.update({
      where: { id: instanceId },
      data: { status: "CANCELLED", endedAt: new Date(), wakeAt: null, bullJobId: null },
    });
    return;
  }

  const subInstance = await prisma.sequenceInstance.create({
    data: { tenantId, workflowId: subflow.id, contactId, status: "ACTIVE", context: {} },
  });
  await prisma.sequenceInstance.update({
    where: { id: instanceId },
    data: {
      status: "PIVOTED",
      pivotedToId: subInstance.id,
      endedAt: new Date(),
      wakeAt: null,
      bullJobId: null,
    },
  });
  await advanceInstance(subInstance.id);
}

// Stops every ACTIVE instance for a contact — used on opt-out, where
// continuing to run any sequence at all would violate rule #5.
export async function cancelActiveInstances(tenantId: string, contactId: string): Promise<void> {
  const instances = await prisma.sequenceInstance.findMany({
    where: { tenantId, contactId, status: "ACTIVE" },
  });
  for (const instance of instances) {
    if (instance.currentStepId) await cancelPendingJob(instance.id, instance.currentStepId);
    await prisma.sequenceInstance.update({
      where: { id: instance.id },
      data: { status: "SUPPRESSED", endedAt: new Date(), wakeAt: null, bullJobId: null },
    });
  }
}
