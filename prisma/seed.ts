// Run with: npx prisma db seed
// Creates tenant #1 (dad's business), an admin login, and demo contacts.
import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/db";
import type { EventType } from "@prisma/client";

function daysAgo(days: number, hours = 0) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000 - hours * 60 * 60 * 1000);
}

// Finds a tag by its current name, or by a previous name (so re-seeding an
// existing database renames the tag in place — preserving its id, so
// TagRule links and existing ContactTag assignments stay intact — instead
// of creating an orphaned duplicate.
async function upsertTag(tenantId: string, name: string, previousNames: string[] = []) {
  const current = await prisma.tag.findFirst({ where: { tenantId, name } });
  if (current) return current;

  for (const oldName of previousNames) {
    const legacy = await prisma.tag.findFirst({ where: { tenantId, name: oldName } });
    if (legacy) {
      return prisma.tag.update({ where: { id: legacy.id }, data: { name } });
    }
  }

  return prisma.tag.create({ data: { tenantId, name } });
}

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "tenant-1" },
    update: { name: "Surabharati" },
    create: {
      name: "Surabharati",
      slug: "tenant-1",
    },
  });

  const passwordHash = await bcrypt.hash(
    process.env.SEED_ADMIN_PASSWORD ?? "changeme123",
    10
  );

  // Renames the owner login in place (preserving id, and every FK that
  // points at it) if it still exists under an old email — same
  // rename-safe pattern as upsertTag — instead of creating a duplicate
  // account when the login email changes.
  const ADMIN_EMAIL = "aryaadkoli@gmail.com";
  const existingAdmin =
    (await prisma.user.findFirst({ where: { tenantId: tenant.id, email: ADMIN_EMAIL } })) ??
    (await prisma.user.findFirst({ where: { tenantId: tenant.id, email: "admin@autobot.local" } }));

  if (existingAdmin) {
    await prisma.user.update({
      where: { id: existingAdmin.id },
      data: { email: ADMIN_EMAIL, passwordHash },
    });
  } else {
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: ADMIN_EMAIL,
        passwordHash,
        name: "Admin",
        role: "OWNER",
      },
    });
  }

  const distribution = await prisma.businessType.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: "Distribution" } },
    update: {},
    create: { tenantId: tenant.id, name: "Distribution" },
  });
  const retail = await prisma.businessType.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: "Retail" } },
    update: {},
    create: { tenantId: tenant.id, name: "Retail" },
  });

  // Services (docs/BLUEPRINT.md §"Service") give Workflows a priority —
  // lower number wins when the gatekeeper has to choose which flow gets
  // a contact's attention (core/gatekeeper/index.ts). Seed one of each
  // kind dad is likely to need on day one; more can be added later from
  // the Workflows page once that UI exists.
  const leadService = await prisma.service.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: "Lead follow-up" } },
    update: {},
    create: {
      tenantId: tenant.id,
      businessTypeId: distribution.id,
      name: "Lead follow-up",
      type: "LEAD",
      priority: 50,
    },
  });
  await prisma.service.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: "Payment reminders" } },
    update: {},
    create: {
      tenantId: tenant.id,
      businessTypeId: distribution.id,
      name: "Payment reminders",
      type: "PAYMENT",
      priority: 10, // beats marketing/lead follow-up for the same contact
    },
  });

  const inactiveTag = await upsertTag(tenant.id, "Inactive 30+ Days", ["dormant-30d"]);
  const highValueTag = await upsertTag(tenant.id, "High-Value Customer", ["high-value"]);
  const newInquiryTag = await upsertTag(tenant.id, "New Inquiry");
  const repeatBuyerTag = await upsertTag(tenant.id, "Repeat Buyer");
  const referralTag = await upsertTag(tenant.id, "Referral");

  // TagRules — the Categorization Script from docs/BLUEPRINT.md. These run
  // automatically whenever a lead is imported (core/tagging/rules.ts).
  const inactiveRuleName = "Mark inactive after 30 days";
  const legacyInactiveRuleName = "Mark dormant after 30 days";
  const inactiveRule =
    (await prisma.tagRule.findFirst({ where: { tenantId: tenant.id, name: inactiveRuleName } })) ??
    (await prisma.tagRule.findFirst({ where: { tenantId: tenant.id, name: legacyInactiveRuleName } }));
  if (inactiveRule) {
    await prisma.tagRule.update({
      where: { id: inactiveRule.id },
      data: { name: inactiveRuleName, tagId: inactiveTag.id },
    });
  } else {
    await prisma.tagRule.create({
      data: {
        tenantId: tenant.id,
        name: inactiveRuleName,
        condition: { all: [{ attr: "last_order_date", op: "olderThanDays", value: 30 }] },
        tagId: inactiveTag.id,
        runOn: "BOTH",
      },
    });
  }

  const highValueRuleName = "Mark high-value by order size";
  const highValueRule = await prisma.tagRule.findFirst({
    where: { tenantId: tenant.id, name: highValueRuleName },
  });
  if (highValueRule) {
    await prisma.tagRule.update({
      where: { id: highValueRule.id },
      data: { tagId: highValueTag.id },
    });
  } else {
    await prisma.tagRule.create({
      data: {
        tenantId: tenant.id,
        name: highValueRuleName,
        condition: { all: [{ attr: "monthly_order_value", op: "gt", value: 50000 }] },
        tagId: highValueTag.id,
        runOn: "INGEST",
      },
    });
  }

  const contacts = [
    {
      phone: "+919810012345",
      name: "Rajesh Sharma",
      businessTypeId: distribution.id,
      city: "Delhi",
      tags: [highValueTag.id, referralTag.id],
      stage: "interested",
      events: [
        { type: "IMPORTED", daysAgo: 5 },
        { type: "MSG_SENT", daysAgo: 4 },
        { type: "MSG_DELIVERED", daysAgo: 4, hoursAgo: -1 },
        { type: "LINK_CLICKED", daysAgo: 3 },
      ],
    },
    {
      phone: "+919820023456",
      name: "Priya Deshmukh",
      businessTypeId: retail.id,
      city: "Mumbai",
      tags: [newInquiryTag.id],
      stage: "new",
      events: [{ type: "IMPORTED", daysAgo: 1 }],
    },
    {
      phone: "+919845034567",
      name: "Suresh Reddy",
      businessTypeId: distribution.id,
      city: "Bengaluru",
      tags: [inactiveTag.id],
      stage: "lost",
      events: [
        { type: "IMPORTED", daysAgo: 45 },
        { type: "MSG_SENT", daysAgo: 40 },
        { type: "MSG_FAILED", daysAgo: 40, hoursAgo: -1 },
      ],
    },
    {
      phone: "+919867045678",
      name: "Anita Kulkarni",
      businessTypeId: retail.id,
      city: "Pune",
      tags: [highValueTag.id, repeatBuyerTag.id],
      stage: "converted",
      events: [
        { type: "IMPORTED", daysAgo: 9 },
        { type: "MSG_SENT", daysAgo: 8 },
        { type: "MSG_DELIVERED", daysAgo: 8, hoursAgo: -1 },
        { type: "REPLIED", daysAgo: 7 },
        { type: "PAYMENT_RECEIVED", daysAgo: 6 },
      ],
    },
    {
      phone: "+919884056789",
      name: "Karthik Iyer",
      businessTypeId: distribution.id,
      city: "Chennai",
      tags: [newInquiryTag.id],
      stage: "contacted",
      events: [
        { type: "IMPORTED", daysAgo: 3 },
        { type: "MSG_SENT", daysAgo: 2 },
        { type: "MSG_DELIVERED", daysAgo: 2, hoursAgo: -1 },
      ],
    },
    {
      phone: "+919490067890",
      name: "Fatima Sheikh",
      businessTypeId: retail.id,
      city: "Hyderabad",
      tags: [inactiveTag.id],
      stage: "lost",
      events: [
        { type: "IMPORTED", daysAgo: 35 },
        { type: "MSG_SENT", daysAgo: 30 },
        { type: "OPTED_OUT", daysAgo: 29 },
      ],
    },
    {
      phone: "+919830078901",
      name: "Debashish Ghosh",
      businessTypeId: distribution.id,
      city: "Kolkata",
      tags: [newInquiryTag.id],
      stage: "new",
      events: [{ type: "IMPORTED", daysAgo: 1 }],
    },
    {
      phone: "+919909089012",
      name: "Meera Patel",
      businessTypeId: retail.id,
      city: "Ahmedabad",
      tags: [highValueTag.id, inactiveTag.id],
      stage: "contacted",
      events: [
        { type: "IMPORTED", daysAgo: 6 },
        { type: "MSG_SENT", daysAgo: 5 },
        { type: "MSG_DELIVERED", daysAgo: 5, hoursAgo: -1 },
        { type: "MSG_READ", daysAgo: 4 },
      ],
    },
  ];

  for (const c of contacts) {
    const attributes = { city: c.city, source: "seed", stage: c.stage };

    const contact = await prisma.contact.upsert({
      where: { tenantId_phone: { tenantId: tenant.id, phone: c.phone } },
      update: { name: c.name, businessTypeId: c.businessTypeId, attributes },
      create: {
        tenantId: tenant.id,
        phone: c.phone,
        name: c.name,
        businessTypeId: c.businessTypeId,
        attributes,
      },
    });

    // Sync tags exactly to the list above (removes any stale assignments
    // left over from a previous seed run or manual testing).
    if (c.tags.length > 0) {
      await prisma.contactTag.deleteMany({
        where: { contactId: contact.id, tagId: { notIn: c.tags } },
      });
    } else {
      await prisma.contactTag.deleteMany({ where: { contactId: contact.id } });
    }
    for (const tagId of c.tags) {
      await prisma.contactTag.upsert({
        where: { contactId_tagId: { contactId: contact.id, tagId } },
        update: {},
        create: { contactId: contact.id, tagId },
      });
    }

    const existingEvents = await prisma.event.count({
      where: { contactId: contact.id },
    });
    if (existingEvents === 0) {
      await prisma.event.createMany({
        data: c.events.map((e) => ({
          tenantId: tenant.id,
          contactId: contact.id,
          type: e.type as EventType,
          occurredAt: daysAgo(e.daysAgo, e.hoursAgo ?? 0),
        })),
      });
    }
  }

  // Pre-registered so it's ready the moment the matching Meta template
  // (same name + language) gets approved in Meta Business Manager —
  // nothing else needs to change on our side when that happens.
  const introTemplateName = "lead_intro_1";
  const existingTemplate = await prisma.messageTemplate.findFirst({
    where: { tenantId: tenant.id, name: introTemplateName },
  });
  if (!existingTemplate) {
    await prisma.messageTemplate.create({
      data: {
        tenantId: tenant.id,
        name: introTemplateName,
        channel: "WHATSAPP",
        metaTemplateName: introTemplateName,
        metaCategory: "MARKETING",
        metaLanguage: "en",
        body: "Hi {{1}}, thanks for your interest! We'll be in touch shortly.",
        variables: [{ pos: 1, source: "contact.name" }],
        approvalStatus: "APPROVED",
      },
    });
  }

  // One DRAFT example workflow so the Workflows page isn't an empty
  // shelf — the exact shape of "send → wait for a reply → branch"
  // described for the mango-farmers case. DRAFT means nothing runs until
  // someone reviews and activates it.
  const existingDemoWorkflow = await prisma.workflow.findFirst({
    where: { tenantId: tenant.id, name: "Lead intro + reply check" },
  });
  if (!existingDemoWorkflow) {
    await prisma.workflow.create({
      data: {
        tenantId: tenant.id,
        serviceId: leadService.id,
        name: "Lead intro + reply check",
        status: "DRAFT",
        definition: {
          entry: "welcome",
          steps: {
            welcome: {
              type: "send",
              channel: "WHATSAPP",
              template: introTemplateName,
              next: "wait_reply",
            },
            wait_reply: {
              type: "wait",
              duration: "48h",
              listen: [{ event: "REPLIED", action: "goto", step: "end_engaged" }],
              next: "end_no_response",
            },
            end_engaged: { type: "end", outcome: "replied" },
            end_no_response: { type: "end", outcome: "no_response" },
          },
        },
      },
    });
  }

  console.log(
    "Seed complete. Login: aryaadkoli@gmail.com /",
    process.env.SEED_ADMIN_PASSWORD ?? "changeme123"
  );
}

main().finally(() => prisma.$disconnect());
