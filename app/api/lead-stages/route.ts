import { z } from "zod";
import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";
import { isOwnerTier } from "@/lib/permissions";

const CreateSchema = z.object({
  customerStatusId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(100),
});

export async function POST(req: Request) {
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

  const parsed = CreateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: "Customer status and name are required" }, { status: 400 });
  }
  const { customerStatusId, name } = parsed.data;

  const status = await prisma.customerStatus.findFirst({
    where: { id: customerStatusId, tenantId, deletedAt: null },
  });
  if (!status) {
    return Response.json({ error: "Customer status not found" }, { status: 404 });
  }

  const existing = await prisma.leadStage.findFirst({
    where: { tenantId, customerStatusId, name },
  });
  if (existing && !existing.deletedAt) {
    return Response.json({ error: "A lead stage with this name already exists under this status" }, { status: 409 });
  }

  const maxOrder = await prisma.leadStage.aggregate({
    where: { tenantId, customerStatusId, deletedAt: null },
    _max: { order: true },
  });
  const order = (maxOrder._max.order ?? -1) + 1;

  const stage = existing
    ? await prisma.leadStage.update({
        where: { id: existing.id },
        data: { deletedAt: null, order },
      })
    : await prisma.leadStage.create({
        data: { tenantId, customerStatusId, name, order, isSystem: false },
      });

  return Response.json(
    { id: stage.id, name: stage.name, customerStatusId: stage.customerStatusId, order: stage.order },
    { status: 201 }
  );
}
