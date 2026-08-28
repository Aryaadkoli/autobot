import { z } from "zod";
import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";
import { requirePermission, MODULES } from "@/lib/permissions";
import type { Module } from "@prisma/client";

const PermissionsPatchSchema = z.object({
  permissions: z.record(
    z.string(),
    z.object({ canView: z.boolean().optional(), canEdit: z.boolean().optional() })
  ),
});

// Update a role's per-module permissions. OWNER/CO_OWNER don't have (or
// need) any RolePermission rows — they bypass the whole system — so this
// only makes sense for MEMBER or a custom role, both blocked below.
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
  const denied = requirePermission(session, "TEAM", "edit");
  if (denied) return denied;

  const { id } = await params;
  const role = await prisma.role.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!role) {
    return Response.json({ error: "Role not found" }, { status: 404 });
  }
  if (role.name === "OWNER" || role.name === "CO_OWNER") {
    return Response.json(
      { error: "OWNER and CO_OWNER always have full access — their permissions can't be changed" },
      { status: 400 }
    );
  }

  const parsed = PermissionsPatchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  await Promise.all(
    MODULES.filter((m) => parsed.data.permissions[m]).map((m: Module) =>
      prisma.rolePermission.upsert({
        where: { roleId_module: { roleId: id, module: m } },
        update: {
          canView: Boolean(parsed.data.permissions[m]?.canView),
          canEdit: Boolean(parsed.data.permissions[m]?.canEdit),
        },
        create: {
          roleId: id,
          module: m,
          canView: Boolean(parsed.data.permissions[m]?.canView),
          canEdit: Boolean(parsed.data.permissions[m]?.canEdit),
        },
      })
    )
  );

  return Response.json({ id });
}

// DELETE a custom role. Two real constraints:
//  - System roles (OWNER/CO_OWNER/MEMBER) can never be deleted — the
//    app's own OWNER checks depend on that exact role existing on every
//    tenant.
//  - A role still assigned to someone is soft-deleted (deletedAt set)
//    instead of removed: whoever has it keeps working exactly as before,
//    it just stops being offered when assigning a role to someone new.
//    Only an unused role is actually removed from the table.
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
  const denied = requirePermission(session, "TEAM", "edit");
  if (denied) return denied;

  const { id } = await params;

  const role = await prisma.role.findFirst({
    where: { id, tenantId: session.tenantId },
    include: { _count: { select: { users: true } } },
  });
  if (!role) {
    return Response.json({ error: "Role not found" }, { status: 404 });
  }
  if (role.isSystem) {
    return Response.json({ error: "Built-in roles can't be deleted" }, { status: 400 });
  }
  if (role.deletedAt) {
    return Response.json({ error: "This role is already deleted" }, { status: 400 });
  }

  if (role._count.users > 0) {
    await prisma.role.update({ where: { id }, data: { deletedAt: new Date() } });
    return Response.json({ id, softDeleted: true, assignedCount: role._count.users });
  }

  await prisma.role.delete({ where: { id } });
  return Response.json({ id, softDeleted: false });
}
