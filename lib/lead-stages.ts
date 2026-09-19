import { prisma } from "./db";

// The ops team's fixed Customer Status / Lead Stage sheet — every tenant
// gets exactly this seeded once, at tenant-creation time (see
// lib/accounts.ts's createTenantWithOwner and both seed scripts). Not
// user-editable in this cut.
export const DEFAULT_LEAD_STAGE_TAXONOMY: { customerStatus: string; leadStages: string[] }[] = [
  {
    customerStatus: "Customer Acquisition Stages",
    leadStages: ["Subscriber", "Lead", "Demo Pitch", "SAL", "SQL", "Opportunity", "Won Customer"],
  },
  {
    customerStatus: "Customer Retention Status",
    leadStages: [
      "Lead",
      "Active",
      "Brand Advocate",
      "At-Risk",
      "Critical",
      "Renewal",
      "Saved",
      "Churned",
      "Negotiation",
      "Closed-Won",
      "Closed-Lost",
    ],
  },
  {
    customerStatus: "Upsell Statuses",
    leadStages: ["Proposal", "Negotiation", "Closed-Won", "Closed-Lost"],
  },
  {
    customerStatus: "Cross-Sell Statuses",
    leadStages: ["Discovery", "Demo Pitch", "Proposal", "Negotiation", "Closed-Won", "Closed-Lost"],
  },
];

// Idempotent (upserts throughout) — safe to call on every tenant creation
// and to re-run from the dev/prod seed scripts.
export async function ensureDefaultLeadStages(tenantId: string) {
  for (const [i, group] of DEFAULT_LEAD_STAGE_TAXONOMY.entries()) {
    const status = await prisma.customerStatus.upsert({
      where: { tenantId_name: { tenantId, name: group.customerStatus } },
      update: { order: i, deletedAt: null },
      create: { tenantId, name: group.customerStatus, order: i, isSystem: true },
    });
    for (const [j, stageName] of group.leadStages.entries()) {
      await prisma.leadStage.upsert({
        where: {
          tenantId_customerStatusId_name: { tenantId, customerStatusId: status.id, name: stageName },
        },
        update: { order: j, deletedAt: null },
        create: { tenantId, customerStatusId: status.id, name: stageName, order: j, isSystem: true },
      });
    }
  }
}

type StatusEntry = { id: string; name: string };
type StageEntry = { id: string; name: string; customerStatusId: string; order: number };
export type LeadStageTaxonomy = { statuses: StatusEntry[]; stages: StageEntry[] };

export async function loadTenantLeadStageTaxonomy(tenantId: string): Promise<LeadStageTaxonomy> {
  const [statuses, stages] = await Promise.all([
    prisma.customerStatus.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, name: true },
    }),
    prisma.leadStage.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, name: true, customerStatusId: true, order: true },
    }),
  ]);
  return { statuses, stages };
}

// Resolves free-text Customer Status / Lead Stage values (from an Excel
// import row, or any other caller) against a tenant's taxonomy. A Lead
// Stage that doesn't belong to the resolved Customer Status is never kept
// as-is — it's replaced by that status's first stage instead, so "customer
// status changes → lead stage changes too" holds everywhere this is used,
// not just in the UI.
export function resolveCustomerStatusAndStage(
  taxonomy: LeadStageTaxonomy,
  customerStatusName: string | null,
  leadStageName: string | null
): { customerStatusId: string | null; leadStageId: string | null } {
  const norm = (s: string) => s.trim().toLowerCase();

  let status = customerStatusName
    ? taxonomy.statuses.find((s) => norm(s.name) === norm(customerStatusName))
    : undefined;

  let stage: StageEntry | undefined;
  if (leadStageName) {
    if (status) {
      const statusId = status.id;
      stage = taxonomy.stages.find(
        (st) => norm(st.name) === norm(leadStageName) && st.customerStatusId === statusId
      );
    } else {
      // No status given — only accept the stage name if it's unambiguous
      // tenant-wide (several stage names, like "Negotiation", exist under
      // more than one status), and let it imply the status.
      const candidates = taxonomy.stages.filter((st) => norm(st.name) === norm(leadStageName));
      if (candidates.length === 1) {
        stage = candidates[0];
        status = taxonomy.statuses.find((s) => s.id === stage!.customerStatusId);
      }
    }
  }

  // A status is known but the stage we ended up with doesn't belong to it
  // (or none resolved) — default to that status's own first stage.
  if (status && (!stage || stage.customerStatusId !== status.id)) {
    stage = taxonomy.stages
      .filter((st) => st.customerStatusId === status!.id)
      .sort((a, b) => a.order - b.order)[0];
  }

  return { customerStatusId: status?.id ?? null, leadStageId: stage?.id ?? null };
}
