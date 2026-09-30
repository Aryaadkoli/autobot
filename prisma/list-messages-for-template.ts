// Read-only diagnostic — lists every Message row for a template by name,
// so a stale row (e.g. from before send-test stopped recording anything)
// can be identified and confirmed before deleting it by id.
// Usage: npx tsx prisma/list-messages-for-template.ts "Introduction to Adike Siri"
import { prisma } from "../lib/db";

async function main() {
  const templateName = process.argv[2];
  if (!templateName) {
    console.error('Usage: npx tsx prisma/list-messages-for-template.ts "Template name"');
    process.exit(1);
  }

  const template = await prisma.messageTemplate.findFirst({ where: { name: templateName } });
  if (!template) {
    console.error(`No template found named "${templateName}"`);
    process.exit(1);
  }

  const messages = await prisma.message.findMany({
    where: { templateId: template.id },
    orderBy: { createdAt: "asc" },
    include: { contact: { select: { name: true, phone: true } } },
  });

  console.log(JSON.stringify(
    messages.map((m) => ({
      id: m.id,
      createdAt: m.createdAt,
      dedupeKey: m.dedupeKey,
      status: m.status,
      contactName: m.contact.name,
      contactPhone: m.contact.phone,
      renderedBody: m.renderedBody,
    })),
    null,
    2
  ));
}

main().finally(() => prisma.$disconnect());
