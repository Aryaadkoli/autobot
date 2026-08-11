import { randomUUID } from "crypto";
import type { Contact, MessageTemplate, Tenant } from "@prisma/client";
import { prisma } from "@/lib/db";
import { renderAndSend } from "./render-send";
import { currentHourInTimezone, isWithinQuietHours } from "../gatekeeper/quiet-hours";

export type SendOutcome =
  | { status: "sent"; messageId: string; renderedBody: string }
  | { status: "failed"; messageId: string; renderedBody: string; error: string }
  | { status: "skipped"; reason: string };

// The one place that actually sends a rendered template to a contact —
// used by both "send test message" and Campaigns, so every send path gets
// the same opt-out, quiet-hours and daily-cap checks. This is a
// gatekeeper-lite: cross-service priority (docs/BLUEPRINT.md §3) is still
// Phase 4/5 — it needs the worker to defer/retry rather than just skip.
export async function sendTemplateToContact({
  template,
  tenant,
  contact,
}: {
  template: MessageTemplate;
  tenant: Tenant;
  contact: Contact;
}): Promise<SendOutcome> {
  const optedOut =
    (template.channel === "WHATSAPP" && contact.waOptedOut) ||
    (template.channel === "EMAIL" && contact.emailOptedOut);
  if (optedOut) {
    return { status: "skipped", reason: "Opted out" };
  }

  const to = template.channel === "EMAIL" ? contact.email : contact.phone;
  if (!to) {
    return { status: "skipped", reason: "No email on file" };
  }

  const localHour = currentHourInTimezone(tenant.timezone);
  if (isWithinQuietHours(localHour, tenant.quietHoursStart, tenant.quietHoursEnd)) {
    return {
      status: "skipped",
      reason: `Quiet hours (no sends ${String(tenant.quietHoursStart).padStart(2, "0")}:00–${String(tenant.quietHoursEnd).padStart(2, "0")}:00 ${tenant.timezone})`,
    };
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentCount = await prisma.message.count({
    where: {
      contactId: contact.id,
      createdAt: { gte: since },
      status: { not: "FAILED" },
    },
  });
  if (recentCount >= tenant.dailyCapPerContact) {
    return {
      status: "skipped",
      reason: `Daily cap reached (${tenant.dailyCapPerContact} messages/24h)`,
    };
  }

  const { renderedBody, result, adapterName } = await renderAndSend(template, tenant, contact);
  if (!result) {
    return { status: "skipped", reason: "No email on file" };
  }

  const message = await prisma.message.create({
    data: {
      tenantId: tenant.id,
      contactId: contact.id,
      templateId: template.id,
      channel: template.channel,
      dedupeKey: `manual:${randomUUID()}`,
      renderedBody,
      status: result.ok ? "SENT" : "FAILED",
      providerMessageId: result.ok ? result.providerMessageId : null,
      error: result.ok ? null : result.error,
      costPaise: result.ok ? (result.costPaise ?? null) : null,
      sentAt: result.ok ? new Date() : null,
    },
  });

  await prisma.event.create({
    data: {
      tenantId: tenant.id,
      contactId: contact.id,
      type: result.ok ? "MSG_SENT" : "MSG_FAILED",
      payload: { messageId: message.id, via: adapterName },
    },
  });

  if (!result.ok) {
    return { status: "failed", messageId: message.id, renderedBody, error: result.error };
  }
  return { status: "sent", messageId: message.id, renderedBody };
}
