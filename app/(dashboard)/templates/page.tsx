import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";
import TemplatesClient from "./templates-client";

export default async function TemplatesPage() {
  const { tenantId } = await requireSession();

  const [templates, leads] = await Promise.all([
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
  ]);

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
        }))}
        leads={leads}
      />
    </div>
  );
}
