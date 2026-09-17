import type { Contact, MessageTemplate, Tenant } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hoursAgo } from "@/lib/dates";
import { currentHourInTimezone, isWithinQuietHours } from "./quiet-hours";

export type GateDecision =
  | { decision: "ALLOW" }
  | { decision: "DEFER"; until: Date; reason: string }
  | { decision: "SUPPRESS"; reason: string };

// Workflow-driven sends only — Campaigns use the lighter core/channels/send.ts checks since they have no "service priority" of their own to compete on.
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

  const since = hoursAgo(24);
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
      // Lower Service.priority number wins (e.g. PAYMENT=10 beats LEAD=50) — defer if a higher-priority flow already has this contact.
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
