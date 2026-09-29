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

  const existing = await prisma.leadStage.findFirst({ where: { id, tenantId } });
  if (!existing) {
    return Response.json({ error: "Lead stage not found" }, { status: 404 });
  }

  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: "Name is required" }, { status: 400 });
  }
  const { name } = parsed.data;

  const clash = await prisma.leadStage.findFirst({
    where: { tenantId, customerStatusId: existing.customerStatusId, name, deletedAt: null, id: { not: id } },
  });
  if (clash) {
    return Response.json({ error: "A lead stage with this name already exists under this status" }, { status: 409 });
  }

  const stage = await prisma.leadStage.update({ where: { id }, data: { name } });
  return Response.json({ id: stage.id, name: stage.name });
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
  if (!isOwnerTier(session.role)) {
    return Response.json({ error: "Only an owner or co-owner can do that" }, { status: 403 });
  }
  const { tenantId } = session;
  const { id } = await params;

  const existing = await prisma.leadStage.findFirst({ where: { id, tenantId } });
  if (!existing) {
    return Response.json({ error: "Lead stage not found" }, { status: 404 });
  }

  const usage = await prisma.contact.count({ where: { tenantId, leadStageId: id } });
  if (usage > 0) {
    return Response.json(
      { error: `${usage} lead(s) are currently set to this stage — reassign them first` },
      { status: 409 }
    );
  }

  await prisma.leadStage.update({ where: { id }, data: { deletedAt: new Date() } });
  return Response.json({ id });
}
