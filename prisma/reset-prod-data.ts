// Run with: CONFIRM_RESET=yes-reset-production-data npx tsx prisma/reset-prod-data.ts
//
// Wipes all business/content data for every tenant in this database, while
// deliberately keeping every login working: Tenant, Account, User, Role,
// and RolePermission rows are never touched. Also kept: BusinessType/Service
// and the CustomerStatus/LeadStage taxonomy — these are configuration
// Workflows/leads depend on to function at all (a service-less tenant can
// never create a Workflow — see prisma/seed.prod.ts's comment), not
// "content" in the sense leads/templates/messages are, so a "blank slate"
// here means an empty CRM ready for real data, not a broken app.
//
// Deleted, in dependency order: Link, Message, Event, SequenceInstance,
// ScheduledCampaign, Campaign, ContactTag, TagRule, Tag, Import, Contact,
// MessageTemplate, Workflow, ApiKey, PasswordResetToken.
//
// This is IRREVERSIBLE. Take a real backup first (deploy/backup.sh) —
// this script does not create one for you.
import "dotenv/config";
// The regular `prisma` export rewrites .deleteMany() on Contact/Tag/
// MessageTemplate/Workflow into a soft-delete (sets deletedAt) — the
// opposite of what a real reset needs. prismaIncludingDeleted is the
// actual unwrapped client, used here so this genuinely removes rows
// instead of just hiding them from the app while they still occupy
// unique-constraint slots forever.
import { prismaIncludingDeleted as prisma } from "../lib/db";

async function main() {
  if (process.env.CONFIRM_RESET !== "yes-reset-production-data") {
    throw new Error(
      "Refusing to run without explicit confirmation. Re-run with " +
        "CONFIRM_RESET=yes-reset-production-data as an environment variable."
    );
  }

  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  console.log(`About to wipe content data for ${tenants.length} tenant(s): ${tenants.map((t) => t.name).join(", ")}`);

  const counts: Record<string, number> = {};

  // Link references Message — must go first, or deleting a Message that
  // still has a tracked link would violate the foreign key.
  counts.Link = (await prisma.link.deleteMany({})).count;
  counts.Message = (await prisma.message.deleteMany({})).count;
  counts.Event = (await prisma.event.deleteMany({})).count;
  counts.SequenceInstance = (await prisma.sequenceInstance.deleteMany({})).count;
  counts.ScheduledCampaign = (await prisma.scheduledCampaign.deleteMany({})).count;
  counts.Campaign = (await prisma.campaign.deleteMany({})).count;
  counts.ContactTag = (await prisma.contactTag.deleteMany({})).count;
  counts.TagRule = (await prisma.tagRule.deleteMany({})).count;
  counts.Tag = (await prisma.tag.deleteMany({})).count;
  counts.Import = (await prisma.import.deleteMany({})).count;
  counts.Contact = (await prisma.contact.deleteMany({})).count;
  counts.MessageTemplate = (await prisma.messageTemplate.deleteMany({})).count;
  counts.Workflow = (await prisma.workflow.deleteMany({})).count;
  counts.ApiKey = (await prisma.apiKey.deleteMany({})).count;
  counts.PasswordResetToken = (await prisma.passwordResetToken.deleteMany({})).count;

  console.log("Deleted row counts:", counts);
  console.log(
    "Kept untouched: Tenant, Account, User, Role, RolePermission, BusinessType, Service, CustomerStatus, LeadStage."
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
