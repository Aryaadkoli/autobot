// Run with: npx tsx prisma/seed.prod.ts
//
// The REAL production seed — deliberately NOT what `npx prisma db seed`
// runs (that stays prisma/seed.ts, the rich demo dataset used for local
// dev/testing). This creates exactly one real tenant with one real
// owner login and nothing else: no demo leads, tags, templates,
// workflows, or campaigns. Safe to re-run (upserts throughout) — it will
// never duplicate the tenant or account, and never touches any real
// data a live business has since added.
import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/db";
import { SYSTEM_ROLE_NAMES } from "../lib/roles";
import { defaultMemberPermissions } from "../lib/permissions";

const OWNER_EMAIL = "aryaadkoli@gmail.com";
const OWNER_NAME = "Arya Adkoli";
const TENANT_NAME = "Surabharati";
const TENANT_SLUG = "surabharati";

async function main() {
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password) {
    throw new Error(
      "SEED_ADMIN_PASSWORD must be set in the environment — refusing to seed a production " +
        "owner account with a hardcoded or guessable password."
    );
  }

  const tenant = await prisma.tenant.upsert({
    where: { slug: TENANT_SLUG },
    update: { name: TENANT_NAME },
    create: { name: TENANT_NAME, slug: TENANT_SLUG },
  });

  const passwordHash = await bcrypt.hash(password, 10);
  const account = await prisma.account.upsert({
    where: { email: OWNER_EMAIL },
    update: { passwordHash, name: OWNER_NAME },
    create: { email: OWNER_EMAIL, name: OWNER_NAME, passwordHash },
  });

  const ownerRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: "OWNER" } },
    update: {},
    create: { tenantId: tenant.id, name: "OWNER", isSystem: true },
  });
  // The other two system roles don't have anyone assigned yet in a fresh
  // prod seed, but they must exist so the "add teammate" role dropdown
  // has something to offer as soon as the owner logs in.
  for (const name of SYSTEM_ROLE_NAMES.filter((n) => n !== "OWNER")) {
    const role = await prisma.role.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name } },
      update: {},
      create: { tenantId: tenant.id, name, isSystem: true },
    });
    if (name === "MEMBER") {
      const defaults = defaultMemberPermissions();
      for (const [module, p] of Object.entries(defaults)) {
        await prisma.rolePermission.upsert({
          where: { roleId_module: { roleId: role.id, module: module as keyof typeof defaults } },
          update: {},
          create: { roleId: role.id, module: module as keyof typeof defaults, canView: p.canView, canEdit: p.canEdit },
        });
      }
    }
  }

  await prisma.user.upsert({
    where: { tenantId_accountId: { tenantId: tenant.id, accountId: account.id } },
    update: { roleId: ownerRole.id },
    create: { tenantId: tenant.id, accountId: account.id, roleId: ownerRole.id },
  });

  // The one piece of non-demo scaffolding this seed creates: Workflows
  // can't be created at all without at least one Service to attach to
  // (there's no "add a service" UI yet — see CLAUDE.md), so a completely
  // service-less tenant would have that feature permanently disabled
  // with no way to unblock it from inside the app. This is
  // configuration, not demo data — no leads, tags, templates,
  // workflows, or campaigns are seeded here.
  const businessType = await prisma.businessType.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: "General" } },
    update: {},
    create: { tenantId: tenant.id, name: "General" },
  });
  await prisma.service.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: "Lead follow-up" } },
    update: {},
    create: {
      tenantId: tenant.id,
      businessTypeId: businessType.id,
      name: "Lead follow-up",
      type: "LEAD",
      priority: 50,
    },
  });

  console.log(`Production seed complete.\n  Tenant: ${TENANT_NAME}\n  Owner login: ${OWNER_EMAIL}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
