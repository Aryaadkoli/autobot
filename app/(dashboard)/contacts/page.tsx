import type { Prisma } from "@prisma/client";
import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";
import { canView, isOwnerTier } from "@/lib/permissions";
import NoModuleAccess from "../no-module-access";
import { STAGES } from "./stages";
import LeadsClient, { type LeadRow } from "./leads-client";
import { PAGE_SIZE } from "./constants";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{
    stage?: string;
    new?: string;
    import?: string;
    q?: string;
    businessType?: string;
    customerStatus?: string;
    leadStage?: string;
    page?: string;
  }>;
}) {
  const session = await requireSession();
  const { tenantId } = session;
  if (!canView(session.permissions, "LEADS")) return <NoModuleAccess />;
  const {
    stage,
    new: newParam,
    import: importParam,
    q,
    businessType,
    customerStatus,
    leadStage,
    page: pageParam,
  } = await searchParams;

  const activeStage = STAGES.some((s) => s.value === stage) ? stage : undefined;
  const search = (q ?? "").trim();
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);

  // Filtered and paginated in the database, not in the browser — this page
  // is built to stay fast whether a tenant has 10 leads or several hundred
  // thousand, so it must never load more than one page's worth of rows at
  // once. Free-text search on name/phone/email uses `contains`, which at
  // truly enormous per-tenant volumes would benefit from a dedicated text
  // index (e.g. Postgres trigram/GIN) beyond what's set up here — a real
  // next step if search itself becomes the bottleneck, not something this
  // page can silently work around. Same goes for the exact filtered COUNT
  // below (needed to show "X-Y of Z" and total pages) — cheap for narrow
  // filters, but a full scan for a broad free-text search at extreme scale;
  // offset pagination itself also gets slower on very deep pages at huge
  // volumes (skip has to walk past every row before it). Both are the
  // standard, accepted trade-off for showing an exact count/range rather
  // than an unbounded "load more" feed, and only bite on the rare deep-page
  // or very-broad-search case, not normal day-to-day use.
  const where: Prisma.ContactWhereInput = {
    tenantId,
    ...(activeStage ? { attributes: { path: ["stage"], equals: activeStage } } : {}),
    ...(businessType ? { businessType: { name: businessType } } : {}),
    ...(customerStatus ? { customerStatusId: customerStatus } : {}),
    ...(leadStage ? { leadStageId: leadStage } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { phone: { contains: search } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [rows, filteredCount, tags, businessTypes, customerStatuses, leadStages, totalLeads, newLeadsCount] =
    await Promise.all([
      prisma.contact.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
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
      prisma.contact.count({ where }),
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

  const leads: LeadRow[] = rows.map((c) => {
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
        search={search}
        businessTypeFilter={businessType ?? ""}
        customerStatusFilter={customerStatus ?? ""}
        leadStageFilter={leadStage ?? ""}
        page={page}
        filteredCount={filteredCount}
        totalLeads={totalLeads}
        newLeadsCount={newLeadsCount}
        openNewOnLoad={newParam === "1"}
        openImportOnLoad={importParam === "1"}
      />
    </div>
  );
}
