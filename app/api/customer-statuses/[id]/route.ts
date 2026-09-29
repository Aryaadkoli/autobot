import { z } from "zod";
import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";
import { isOwnerTier } from "@/lib/permissions";

const PatchSchema = z.object({ name: z.string().trim().min(1).max(100) });

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
  if (!isOwnerTier(session.role)) {
    return Response.json({ error: "Only an owner or co-owner can do that" }, { status: 403 });
  }
  const { tenantId } = session;
  const { id } = await params;

  const existing = await prisma.customerStatus.findFirst({ where: { id, tenantId } });
  if (!existing) {
    return Response.json({ error: "Customer status not found" }, { status: 404 });
  }

  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: "Name is required" }, { status: 400 });
  }
  const { name } = parsed.data;

  const clash = await prisma.customerStatus.findFirst({
    where: { tenantId, name, deletedAt: null, id: { not: id } },
  });
  if (clash) {
    return Response.json({ error: "A customer status with this name already exists" }, { status: 409 });
  }

  const status = await prisma.customerStatus.update({ where: { id }, data: { name } });
  return Response.json({ id: status.id, name: status.name });
}

// Cascades to this status's own (unused) lead stages so deleting a whole
// track is one action, not "delete every stage first, then the status" —
// but only ever cascades over stages nothing is actually assigned to;
// if any stage (or the status itself) is in use, the entire delete is
// refused rather than partially applied.
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
  if (!isOwnerTier(session.role)) {
    return Response.json({ error: "Only an owner or co-owner can do that" }, { status: 403 });
  }
  const { tenantId } = session;
  const { id } = await params;

  const existing = await prisma.customerStatus.findFirst({
    where: { id, tenantId },
    include: { leadStages: { where: { deletedAt: null } } },
  });
  if (!existing) {
    return Response.json({ error: "Customer status not found" }, { status: 404 });
  }

  // A single distinct count, not two summed counts — a lead normally has
  // both customerStatusId and leadStageId pointing into the same track, so
  // adding separate counts would double-count it.
  const stageIds = existing.leadStages.map((s) => s.id);
  const usage = await prisma.contact.count({
    where: {
      tenantId,
      OR: [{ customerStatusId: id }, ...(stageIds.length > 0 ? [{ leadStageId: { in: stageIds } }] : [])],
    },
  });

  if (usage > 0) {
    return Response.json(
      { error: `${usage} lead(s) are currently set to this status or one of its stages — reassign them first` },
      { status: 409 }
    );
  }

  await prisma.$transaction([
    prisma.leadStage.updateMany({
      where: { customerStatusId: id, deletedAt: null },
      data: { deletedAt: new Date() },
    }),
    prisma.customerStatus.update({ where: { id }, data: { deletedAt: new Date() } }),
  ]);

  return Response.json({ id });
}
