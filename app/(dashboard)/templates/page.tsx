import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";
import TemplatesClient from "./templates-client";

export default async function TemplatesPage() {
  const { tenantId } = await requireSession();

  const [templates, leads, sendGroups] = await Promise.all([
    prisma.messageTemplate.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.contact.findMany({
      where: { tenantId },
      select: { id: true, name: true, phone: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.message.groupBy({
      by: ["templateId", "status"],
      where: { tenantId, templateId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const sendCountByTemplate: Record<string, { sent: number; delivered: number; failed: number }> = {};
  for (const g of sendGroups) {
    if (!g.templateId) continue;
    const row = (sendCountByTemplate[g.templateId] ??= { sent: 0, delivered: 0, failed: 0 });
    const n = g._count._all;
    if (g.status === "SENT" || g.status === "DELIVERED" || g.status === "READ") row.sent += n;
    if (g.status === "DELIVERED" || g.status === "READ") row.delivered += n;
    if (g.status === "FAILED") {
      row.sent += n;
      row.failed += n;
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-stone-900 mb-6">Templates</h1>
      <TemplatesClient
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          channel: t.channel,
          body: t.body,
          metaCategory: t.metaCategory,
          metaTemplateName: t.metaTemplateName,
          metaLanguage: t.metaLanguage,
          mediaUrl: t.mediaUrl,
          mediaType: t.mediaType,
          variables: (t.variables ?? []) as { pos: number; source: string }[],
          approvalStatus: t.approvalStatus,
          sends: sendCountByTemplate[t.id] ?? { sent: 0, delivered: 0, failed: 0 },
        }))}
        leads={leads}
      />
    </div>
  );
}
