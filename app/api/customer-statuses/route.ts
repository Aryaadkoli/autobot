import { z } from "zod";
import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";
import { isOwnerTier } from "@/lib/permissions";

const CreateSchema = z.object({ name: z.string().trim().min(1).max(100) });

// Customer Status / Lead Stage is a taxonomy that shapes how leads move
// through the pipeline (see lib/lead-stages.ts) — only OWNER/CO_OWNER can
// change it, same tier as team/role management, not gated by a
// RolePermission module since it isn't one.
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
    return Response.json({ error: "Name is required" }, { status: 400 });
  }
  const { name } = parsed.data;

  const existing = await prisma.customerStatus.findFirst({
    where: { tenantId, name },
  });
  if (existing && !existing.deletedAt) {
    return Response.json({ error: "A customer status with this name already exists" }, { status: 409 });
  }

  const maxOrder = await prisma.customerStatus.aggregate({
    where: { tenantId, deletedAt: null },
    _max: { order: true },
  });
  const order = (maxOrder._max.order ?? -1) + 1;

  // A soft-deleted status with this exact name is resurrected instead of
  // erroring on the unique constraint — same pattern used for
  // Tags/Roles/Contacts elsewhere (see lib/db.ts's soft-delete extension).
  const status = existing
    ? await prisma.customerStatus.update({
        where: { id: existing.id },
        data: { deletedAt: null, order },
      })
    : await prisma.customerStatus.create({
        data: { tenantId, name, order, isSystem: false },
      });

  return Response.json({ id: status.id, name: status.name, order: status.order }, { status: 201 });
}
