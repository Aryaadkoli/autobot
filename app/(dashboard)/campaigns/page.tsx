import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";
import CampaignsClient from "./campaigns-client";

export default async function CampaignsPage() {
  const { tenantId } = await requireSession();

  const [templates, tags, history, scheduled] = await Promise.all([
    prisma.messageTemplate.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, channel: true, metaTemplateName: true },
    }),
    prisma.tag.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
    prisma.campaign.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { template: { select: { name: true } } },
    }),
    prisma.scheduledCampaign.findMany({
      where: { tenantId },
      orderBy: { scheduledFor: "asc" },
      take: 20,
      include: {
        template: { select: { name: true } },
        tag: { select: { name: true } },
      },
    }),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-stone-900 mb-2">Campaigns</h1>
      <p className="text-sm text-stone-500 mb-6 max-w-xl">
        Send one template to a group of leads now, or schedule it for a
        future date — filtered by tag/stage, or an uploaded list.
      </p>
      <CampaignsClient
        templates={templates}
        tags={tags}
        history={history.map((h) => ({
          id: h.id,
          templateName: h.template?.name ?? "(deleted template)",
          source: h.source,
          targetedCount: h.targetedCount,
          sentCount: h.sentCount,
          failedCount: h.failedCount,
          skippedCount: h.skippedCount,
          createdAt: h.createdAt.toISOString(),
        }))}
        scheduled={scheduled.map((s) => ({
          id: s.id,
          name: s.name,
          templateName: s.template.name,
          tagName: s.tag?.name ?? null,
          stage: s.stage,
          scheduledFor: s.scheduledFor.toISOString(),
          status: s.status,
          recurrence: s.recurrence,
          errorMessage: s.errorMessage,
        }))}
      />
    </div>
  );
}
