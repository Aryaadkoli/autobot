import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";
import { canView, isOwnerTier } from "@/lib/permissions";
import NoModuleAccess from "../no-module-access";
import { STAGES } from "./stages";
import LeadsClient, { type LeadRow } from "./leads-client";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; new?: string; import?: string }>;
}) {
  const session = await requireSession();
  const { tenantId } = session;
  if (!canView(session.permissions, "LEADS")) return <NoModuleAccess />;
  const { stage, new: newParam, import: importParam } = await searchParams;

  const activeStage = STAGES.some((s) => s.value === stage) ? stage : undefined;

  const [contacts, tags, businessTypes, customerStatuses, leadStages, totalLeads, newLeadsCount] =
    await Promise.all([
      prisma.contact.findMany({
        // Stage/business type/customer status/lead stage are all filtered
        // client-side now (see leads-client.tsx) — the whole page's worth
        // of leads is fetched once, same as search already worked.
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          attributes: true,
          createdAt: true,
          businessType: { select: { name: true } },
          customerStatus: { select: { id: true, name: true } },
          leadStage: { select: { id: true, name: true } },
          tags: { select: { tag: { select: { id: true, name: true } } } },
        },
      }),
      prisma.tag.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
      prisma.businessType.findMany({
        where: { tenantId },
        orderBy: { name: "asc" },
      }),
      prisma.customerStatus.findMany({
        where: { tenantId, deletedAt: null },
        orderBy: { order: "asc" },
        select: { id: true, name: true },
      }),
      prisma.leadStage.findMany({
        where: { tenantId, deletedAt: null },
        orderBy: { order: "asc" },
        select: { id: true, name: true, customerStatusId: true },
      }),
      prisma.contact.count({ where: { tenantId } }),
      prisma.contact.count({
        where: { tenantId, attributes: { path: ["stage"], equals: "new" } },
      }),
    ]);

  const leads: LeadRow[] = contacts.map((c) => {
    const attrs = c.attributes as Record<string, unknown> | null;
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      businessType: c.businessType?.name ?? null,
      city: (attrs?.city as string | undefined) ?? null,
      region: (attrs?.region as string | undefined) ?? null,
      product: (attrs?.product as string | undefined) ?? null,
      stage: (attrs?.stage as string | undefined) ?? "new",
      customerStatus: c.customerStatus ? { id: c.customerStatus.id, name: c.customerStatus.name } : null,
      leadStage: c.leadStage ? { id: c.leadStage.id, name: c.leadStage.name } : null,
      createdAt: c.createdAt.toISOString(),
      tags: c.tags.map((t) => ({ id: t.tag.id, name: t.tag.name })),
    };
  });

  return (
    <div>
      <LeadsClient
        leads={leads}
        allTags={tags}
        businessTypes={businessTypes}
        customerStatuses={customerStatuses}
        leadStages={leadStages}
        canManageTaxonomy={isOwnerTier(session.role)}
        activeStage={activeStage}
        totalLeads={totalLeads}
        newLeadsCount={newLeadsCount}
        openNewOnLoad={newParam === "1"}
        openImportOnLoad={importParam === "1"}
      />
    </div>
  );
}
