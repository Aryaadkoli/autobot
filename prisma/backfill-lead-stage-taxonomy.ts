// ensureDefaultLeadStages() only ever runs automatically at tenant-creation
// time (lib/accounts.ts's createTenantWithOwner, and both seed scripts) —
// a tenant that existed before the Customer Status/Lead Stage feature
// shipped never got it seeded. This is a one-off backfill for exactly
// that: loops over every tenant and calls the same idempotent upsert
// function, so it's safe to run repeatedly and safe to run against a
// tenant that already has the taxonomy (no duplicates, no changes for
// rows that already match).
import { prisma } from "../lib/db";
import { ensureDefaultLeadStages } from "../lib/lead-stages";

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  for (const tenant of tenants) {
    const before = await prisma.customerStatus.count({ where: { tenantId: tenant.id } });
    await ensureDefaultLeadStages(tenant.id);
    const after = await prisma.customerStatus.count({ where: { tenantId: tenant.id } });
    console.log(`${tenant.name}: ${before} -> ${after} customer statuses`);
  }
}

main().finally(() => prisma.$disconnect());
