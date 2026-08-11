import { z } from "zod";
import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";

const BodySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  templateId: z.string().min(1),
  tagId: z.string().optional(),
  stage: z.string().optional(),
  scheduledFor: z.coerce.date(),
  recurrence: z.enum(["NONE", "MONTHLY", "YEARLY"]).optional(),
});

export async function GET() {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const scheduled = await prisma.scheduledCampaign.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { scheduledFor: "asc" },
    include: {
      template: { select: { name: true } },
      tag: { select: { name: true } },
    },
  });

  return Response.json(scheduled);
}

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
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { name, templateId, tagId, stage, scheduledFor, recurrence } = parsed.data;

  const [template, tag] = await Promise.all([
    prisma.messageTemplate.findFirst({
      where: { id: templateId, tenantId: session.tenantId },
    }),
    tagId
      ? prisma.tag.findFirst({ where: { id: tagId, tenantId: session.tenantId } })
      : null,
  ]);
  if (!template) {
    return Response.json({ error: "Template not found" }, { status: 404 });
  }
  if (tagId && !tag) {
    return Response.json({ error: "Tag not found" }, { status: 404 });
  }

  const scheduled = await prisma.scheduledCampaign.create({
    data: {
      tenantId: session.tenantId,
      templateId,
      name,
      tagId: tagId || null,
      stage: stage || null,
      scheduledFor,
      recurrence: recurrence ?? "NONE",
    },
  });

  return Response.json(scheduled, { status: 201 });
}
