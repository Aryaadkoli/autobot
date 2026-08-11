import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";

const TagInputSchema = z.object({
  name: z.string().trim().min(1, "Tag name is required").max(50),
});

export async function PATCH(
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

  const tag = await prisma.tag.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!tag) return Response.json({ error: "Tag not found" }, { status: 404 });

  const parsed = TagInputSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid tag name" },
      { status: 400 }
    );
  }

  const clash = await prisma.tag.findFirst({
    where: {
      tenantId: session.tenantId,
      name: { equals: parsed.data.name, mode: "insensitive" },
      NOT: { id },
    },
  });
  if (clash) {
    return Response.json(
      { error: "A tag with this name already exists" },
      { status: 409 }
    );
  }

  try {
    const updated = await prisma.tag.update({
      where: { id },
      data: { name: parsed.data.name },
    });
    return Response.json(updated);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return Response.json(
        { error: "A tag with this name already exists" },
        { status: 409 }
      );
    }
    throw e;
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;

  const tag = await prisma.tag.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!tag) return Response.json({ error: "Tag not found" }, { status: 404 });

  const usedByRule = await prisma.tagRule.findFirst({ where: { tagId: id } });
  if (usedByRule) {
    return Response.json(
      {
        error: `Remove the "${usedByRule.name}" rule before deleting this tag`,
      },
      { status: 400 }
    );
  }

  const usedByScheduled = await prisma.scheduledCampaign.findFirst({
    where: { tagId: id, status: "PENDING" },
  });
  if (usedByScheduled) {
    return Response.json(
      {
        error: `Cancel the scheduled campaign "${usedByScheduled.name}" before deleting this tag`,
      },
      { status: 400 }
    );
  }

  const usageCount = await prisma.contactTag.count({ where: { tagId: id } });
  if (usageCount > 0) {
    return Response.json(
      {
        error: `This tag is on ${usageCount} lead${
          usageCount === 1 ? "" : "s"
        }. Remove it from ${usageCount === 1 ? "that lead" : "those leads"} before deleting.`,
      },
      { status: 400 }
    );
  }

  await prisma.tag.delete({ where: { id } });

  return Response.json({ id });
}
