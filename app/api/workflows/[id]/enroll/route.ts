import { z } from "zod";
import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";
import { enroll } from "@/core/workflow/engine";

const BodySchema = z.object({
  tagId: z.string().optional(),
  stage: z.string().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;

  const workflow = await prisma.workflow.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!workflow) {
    return Response.json({ error: "Workflow not found" }, { status: 404 });
  }
  if (workflow.status !== "ACTIVE") {
    return Response.json(
      { error: "Activate the workflow before enrolling leads into it" },
      { status: 400 }
    );
  }

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const { tagId, stage } = parsed.data;

  const [tag, contacts] = await Promise.all([
    tagId
      ? prisma.tag.findFirst({ where: { id: tagId, tenantId: session.tenantId } })
      : null,
    prisma.contact.findMany({
      where: {
        tenantId: session.tenantId,
        ...(tagId ? { tags: { some: { tagId } } } : {}),
        ...(stage ? { attributes: { path: ["stage"], equals: stage } } : {}),
      },
    }),
  ]);
  if (tagId && !tag) {
    return Response.json({ error: "Tag not found" }, { status: 404 });
  }
  if (contacts.length === 0) {
    return Response.json({ enrolled: 0, alreadyActive: 0, total: 0 });
  }

  // Cap per-run like Campaigns (core/channels/campaign.ts) — this runs
  // each contact's first step(s) synchronously, so an unbounded batch
  // could hold the request open a long time.
  const MAX = 200;
  const targeted = contacts.slice(0, MAX);

  let enrolled = 0;
  let alreadyActive = 0;
  for (const contact of targeted) {
    const before = await prisma.sequenceInstance.count({
      where: { tenantId: session.tenantId, workflowId: id, contactId: contact.id, status: "ACTIVE" },
    });
    await enroll(session.tenantId, id, contact.id);
    if (before > 0) alreadyActive++;
    else enrolled++;
  }

  return Response.json({
    enrolled,
    alreadyActive,
    total: contacts.length,
    truncated: contacts.length > MAX,
  });
}
