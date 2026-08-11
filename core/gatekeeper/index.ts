import type { Contact, MessageTemplate, Tenant } from "@prisma/client";
import { prisma } from "@/lib/db";
import { currentHourInTimezone, isWithinQuietHours } from "./quiet-hours";

export type GateDecision =
  | { decision: "ALLOW" }
  | { decision: "DEFER"; until: Date; reason: string }
  | { decision: "SUPPRESS"; reason: string };

// The full gatekeeper (docs/BLUEPRINT.md §3, CLAUDE.md rule #5): every
// check the workflow engine's send steps go through, in order, before
// anything reaches a channel adapter. Campaigns still use the lighter
// core/channels/send.ts checks (opt-out + quiet hours + daily cap) since
// an immediate/scheduled campaign has no "service priority" of its own —
// this full version is specifically for workflow-driven sends, which can
// compete with each other for the same contact.
export async function canSend({
  contact,
  tenant,
  template,
  workflowId,
}: {
  contact: Contact;
  tenant: Tenant;
  template: MessageTemplate;
  workflowId?: string;
}): Promise<GateDecision> {
  const optedOut =
    (template.channel === "WHATSAPP" && contact.waOptedOut) ||
    (template.channel === "EMAIL" && contact.emailOptedOut);
  if (optedOut) {
    return { decision: "SUPPRESS", reason: "Opted out" };
  }

  const localHour = currentHourInTimezone(tenant.timezone);
  if (isWithinQuietHours(localHour, tenant.quietHoursStart, tenant.quietHoursEnd)) {
    return {
      decision: "DEFER",
      until: nextQuietHoursEnd(tenant, localHour),
      reason: `Quiet hours (${tenant.timezone})`,
    };
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentCount = await prisma.message.count({
    where: { contactId: contact.id, createdAt: { gte: since }, status: { not: "FAILED" } },
  });
  if (recentCount >= tenant.dailyCapPerContact) {
    return {
      decision: "DEFER",
      until: new Date(Date.now() + 60 * 60 * 1000), // retry in an hour
      reason: `Daily cap reached (${tenant.dailyCapPerContact}/24h)`,
    };
  }

  if (workflowId) {
    const thisWorkflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
      include: { service: true },
    });
    if (thisWorkflow) {
      // Does a different ACTIVE flow with a higher-priority service (lower
      // Service.priority number — e.g. PAYMENT=10 beats LEAD=50) already
      // have this contact right now? If so, defer — don't compete for
      // their attention.
      const blocker = await prisma.sequenceInstance.findFirst({
        where: {
          tenantId: contact.tenantId,
          contactId: contact.id,
          status: "ACTIVE",
          workflowId: { not: workflowId },
          workflow: { service: { priority: { lt: thisWorkflow.service.priority } } },
        },
        include: { workflow: { include: { service: true } } },
      });
      if (blocker) {
        return {
          decision: "DEFER",
          until: new Date(Date.now() + 60 * 60 * 1000),
          reason: `Higher-priority flow "${blocker.workflow.service.name}" has this contact right now`,
        };
      }
    }
  }

  return { decision: "ALLOW" };
}

function nextQuietHoursEnd(tenant: Tenant, currentLocalHour: number): Date {
  // The local hour is known; find how many hours until quietHoursEnd,
  // then apply that offset to the actual server clock (safe even though
  // the server may run in a different timezone than the tenant).
  const hoursUntilEnd =
    (tenant.quietHoursEnd - currentLocalHour + 24) % 24 || 24;
  return new Date(Date.now() + hoursUntilEnd * 60 * 60 * 1000);
}
