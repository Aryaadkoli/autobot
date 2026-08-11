import type { Contact, SequenceInstance } from "@prisma/client";
import { prisma } from "@/lib/db";
import { renderMessage, deliverRendered } from "../channels/render-send";
import { wrapLinksForTracking } from "./link-tracking";
import { canSend } from "../gatekeeper";
import type { SendStep } from "./schema";

export type SendStepOutcome =
  | { outcome: "sent" | "failed" | "suppressed" }
  | { outcome: "deferred"; until: Date };

// The workflow engine's send — distinct from core/channels/send.ts's
// sendTemplateToContact() because it goes through the FULL gatekeeper
// (including cross-service priority), rewrites links for click tracking,
// and uses the idempotency dedupeKey rule (`${instanceId}:${stepId}`,
// CLAUDE.md rule #2) instead of a random one, since a workflow step can
// legitimately be retried (a delayed job firing twice must never
// double-send).
export async function sendWorkflowStep({
  instance,
  contact,
  step,
  stepId,
}: {
  instance: SequenceInstance;
  contact: Contact;
  step: SendStep;
  stepId: string;
}): Promise<SendStepOutcome> {
  const dedupeKey = `${instance.id}:${stepId}`;
  const already = await prisma.message.findUnique({ where: { dedupeKey } });
  if (already) return { outcome: already.status === "FAILED" ? "failed" : "sent" };

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: instance.tenantId } });
  const template = await prisma.messageTemplate.findFirst({
    where: { tenantId: instance.tenantId, name: step.template },
  });
  if (!template) {
    throw new Error(`Step "${stepId}" references unknown template "${step.template}"`);
  }

  const gate = await canSend({ contact, tenant, template, workflowId: instance.workflowId });
  if (gate.decision === "SUPPRESS") {
    await logSkip(instance, stepId, gate.reason);
    return { outcome: "suppressed" };
  }
  if (gate.decision === "DEFER") {
    return { outcome: "deferred", until: gate.until };
  }

  const rendered = renderMessage(template, contact);
  if (!rendered.to || rendered.renderedBody === null) {
    await logSkip(instance, stepId, "No address on file");
    return { outcome: "suppressed" };
  }

  // Create the Message row first (QUEUED) so link-wrapping has a
  // messageId to attach Link rows to, then deliver the wrapped body.
  const message = await prisma.message.create({
    data: {
      tenantId: instance.tenantId,
      contactId: instance.contactId,
      instanceId: instance.id,
      stepId,
      templateId: template.id,
      channel: template.channel,
      dedupeKey,
      renderedBody: rendered.renderedBody,
      status: "QUEUED",
    },
  });

  const wrappedBody = await wrapLinksForTracking(rendered.renderedBody, instance.tenantId, message.id);
  const { result, adapterName } = await deliverRendered(
    template,
    tenant,
    rendered.to,
    wrappedBody,
    rendered.bodyParameters
  );

  await prisma.message.update({
    where: { id: message.id },
    data: {
      renderedBody: wrappedBody,
      status: result.ok ? "SENT" : "FAILED",
      providerMessageId: result.ok ? result.providerMessageId : null,
      error: result.ok ? null : result.error,
      costPaise: result.ok ? (result.costPaise ?? null) : null,
      sentAt: result.ok ? new Date() : null,
    },
  });

  await prisma.event.create({
    data: {
      tenantId: instance.tenantId,
      contactId: instance.contactId,
      type: result.ok ? "MSG_SENT" : "MSG_FAILED",
      payload: { messageId: message.id, via: adapterName, instanceId: instance.id, stepId },
    },
  });

  return { outcome: result.ok ? "sent" : "failed" };
}

async function logSkip(instance: SequenceInstance, stepId: string, reason: string): Promise<void> {
  await prisma.event.create({
    data: {
      tenantId: instance.tenantId,
      contactId: instance.contactId,
      type: "CUSTOM",
      payload: { workflowStepSkipped: true, reason, instanceId: instance.id, stepId },
    },
  });
}
