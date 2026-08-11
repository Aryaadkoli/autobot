import type { Contact, MessageTemplate, Tenant } from "@prisma/client";
import { prisma } from "@/lib/db";
import { sendTemplateToContact } from "./send";

// Stopgap until the real queue-based worker (docs/BLUEPRINT.md Phase 4,
// needs Redis) exists — run again with a different filter, or after 24h
// for anyone the daily cap skipped, to reach more than this in one day.
const MAX_RECIPIENTS = 200;
const DELAY_MS = 150;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type CampaignRunResult = {
  campaignId: string;
  totalTargeted: number;
  sent: number;
  failed: number;
  skipped: Record<string, number>;
  truncated: boolean;
};

// Sends one template to a list of contacts (already deduped by the caller)
// and records a Campaign history row. Shared by both targeting modes —
// tag/stage filter and uploaded-list.
export async function runCampaign({
  template,
  tenant,
  contacts,
  source,
}: {
  template: MessageTemplate;
  tenant: Tenant;
  contacts: Contact[];
  source: string;
}): Promise<CampaignRunResult> {
  const truncated = contacts.length > MAX_RECIPIENTS;
  const targeted = contacts.slice(0, MAX_RECIPIENTS);

  let sent = 0;
  let failed = 0;
  const skipped: Record<string, number> = {};

  for (let i = 0; i < targeted.length; i++) {
    const outcome = await sendTemplateToContact({
      template,
      tenant,
      contact: targeted[i],
    });
    if (outcome.status === "sent") sent++;
    else if (outcome.status === "failed") failed++;
    else skipped[outcome.reason] = (skipped[outcome.reason] ?? 0) + 1;

    if (i < targeted.length - 1) await sleep(DELAY_MS);
  }

  const campaign = await prisma.campaign.create({
    data: {
      tenantId: tenant.id,
      templateId: template.id,
      source,
      targetedCount: targeted.length,
      sentCount: sent,
      failedCount: failed,
      skippedCount: Object.values(skipped).reduce((a, b) => a + b, 0),
    },
  });

  return {
    campaignId: campaign.id,
    totalTargeted: targeted.length,
    sent,
    failed,
    skipped,
    truncated,
  };
}

function describeSource(name: string, tagName?: string, stage?: string) {
  const parts = [];
  if (tagName) parts.push(`tag "${tagName}"`);
  if (stage) parts.push(`stage "${stage}"`);
  return `Scheduled: ${name}${parts.length ? ` (${parts.join(", ")})` : ""}`;
}

// e.g. every January for mango season, every March for smart-meter renewals —
// after a recurring ScheduledCampaign fires, queue up the next occurrence
// instead of making the owner recreate it by hand each time.
function nextOccurrence(from: Date, recurrence: "MONTHLY" | "YEARLY"): Date {
  const next = new Date(from);
  if (recurrence === "MONTHLY") next.setMonth(next.getMonth() + 1);
  else next.setFullYear(next.getFullYear() + 1);
  return next;
}

// Polled by the in-process scheduler (instrumentation.ts) roughly once a
// minute. Picks up every PENDING ScheduledCampaign whose time has come,
// runs it through the same runCampaign() as an immediate send, and marks
// it SENT (or FAILED, with the error recorded — never left stuck PENDING).
export async function runDueScheduledCampaigns(): Promise<number> {
  const due = await prisma.scheduledCampaign.findMany({
    where: { status: "PENDING", scheduledFor: { lte: new Date() } },
    include: { template: true, tag: true },
  });

  for (const sc of due) {
    try {
      const tenant = await prisma.tenant.findUniqueOrThrow({
        where: { id: sc.tenantId },
      });
      const contacts = await prisma.contact.findMany({
        where: {
          tenantId: sc.tenantId,
          ...(sc.tagId ? { tags: { some: { tagId: sc.tagId } } } : {}),
          ...(sc.stage
            ? { attributes: { path: ["stage"], equals: sc.stage } }
            : {}),
        },
        orderBy: { createdAt: "desc" },
      });

      const result = await runCampaign({
        template: sc.template,
        tenant,
        contacts,
        source: describeSource(sc.name, sc.tag?.name, sc.stage ?? undefined),
      });

      await prisma.scheduledCampaign.update({
        where: { id: sc.id },
        data: { status: "SENT", ranCampaignId: result.campaignId },
      });

      if (sc.recurrence !== "NONE") {
        await prisma.scheduledCampaign.create({
          data: {
            tenantId: sc.tenantId,
            templateId: sc.templateId,
            name: sc.name,
            tagId: sc.tagId,
            stage: sc.stage,
            scheduledFor: nextOccurrence(sc.scheduledFor, sc.recurrence),
            recurrence: sc.recurrence,
          },
        });
      }
    } catch (e) {
      await prisma.scheduledCampaign.update({
        where: { id: sc.id },
        data: {
          status: "FAILED",
          errorMessage: e instanceof Error ? e.message : "Unknown error",
        },
      });
    }
  }

  return due.length;
}
