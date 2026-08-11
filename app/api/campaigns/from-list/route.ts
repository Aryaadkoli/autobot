import { z } from "zod";
import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";
import { importContacts } from "@/core/ingestion/upsert";
import { runCampaign } from "@/core/channels/campaign";

const BodySchema = z.object({
  filename: z.string().min(1).max(255),
  columnMapping: z.record(z.string(), z.string()),
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(5000),
  templateId: z.string().min(1),
  tag: z.string().trim().max(50).optional(),
});

export async function POST(req: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { filename, columnMapping, rows, templateId, tag } = parsed.data;

  if (!Object.values(columnMapping).includes("phone")) {
    return Response.json(
      { error: "Map at least one column to Phone" },
      { status: 400 }
    );
  }

  const [template, tenant] = await Promise.all([
    prisma.messageTemplate.findFirst({
      where: { id: templateId, tenantId: session.tenantId },
    }),
    prisma.tenant.findUniqueOrThrow({ where: { id: session.tenantId } }),
  ]);
  if (!template) {
    return Response.json({ error: "Template not found" }, { status: 404 });
  }

  // Dedupe on phone, create/update leads, apply TagRules — same pipeline
  // as the Imports page. This is what "look for duplicates and add to
  // leads automatically" actually is: one shared, already-tested function.
  const importResult = await importContacts({
    tenantId: session.tenantId,
    rows,
    columnMapping,
    tagName: tag || undefined,
  });

  const contacts =
    importResult.contactIds.length > 0
      ? await prisma.contact.findMany({
          where: { id: { in: importResult.contactIds }, tenantId: session.tenantId },
        })
      : [];

  const campaignResult = await runCampaign({
    template,
    tenant,
    contacts,
    source: `Uploaded list: ${filename}`,
  });

  return Response.json({ importResult, campaignResult });
}
