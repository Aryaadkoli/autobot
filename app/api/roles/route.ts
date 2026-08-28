import { z } from "zod";
import { Prisma, type Module } from "@prisma/client";
import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";
import { requirePermission, MODULES } from "@/lib/permissions";
import { SYSTEM_ROLE_NAMES } from "@/lib/roles";

const RoleInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(50),
  // What this role can see/do per module — e.g. {"LEADS":{"canView":true,"canEdit":false}}.
  // Any module left out defaults to no access. This is how an owner
  // "chooses what they can view" for a brand new role.
  permissions: z
    .record(z.string(), z.object({ canView: z.boolean().optional(), canEdit: z.boolean().optional() }))
    .optional(),
});

// Same TEAM permission as team-member management — a CO_OWNER can do
// this too (see lib/permissions.ts), a plain MEMBER or custom role can't
// unless explicitly given canEdit on TEAM.
export async function POST(req: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  const denied = requirePermission(session, "TEAM", "edit");
  if (denied) return denied;

  const parsed = RoleInputSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const name = parsed.data.name.toUpperCase();

  if ((SYSTEM_ROLE_NAMES as readonly string[]).includes(name)) {
    return Response.json(
      { error: `"${name}" is a built-in role name and can't be reused` },
      { status: 400 }
    );
  }

  const permInput = parsed.data.permissions ?? {};
  const permRows = MODULES.filter((m) => permInput[m]).map((m: Module) => ({
    module: m,
    canView: Boolean(permInput[m]?.canView),
    canEdit: Boolean(permInput[m]?.canEdit),
  }));

  // Role's (tenantId, name) is a real, unconditional unique constraint —
  // if this name was used by a role that's since been soft-deleted, that
  // row still physically occupies it. Resurrect it (with the new
  // permissions, replacing whatever it had before) instead of failing.
  const existingByName = await prisma.role.findFirst({ where: { tenantId: session.tenantId, name } });
  if (existingByName && !existingByName.deletedAt) {
    return Response.json({ error: "A role with this name already exists" }, { status: 409 });
  }

  try {
    const role = existingByName
      ? await prisma.role.update({ where: { id: existingByName.id }, data: { deletedAt: null } })
      : await prisma.role.create({ data: { tenantId: session.tenantId, name, isSystem: false } });

    if (existingByName) {
      await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    }
    if (permRows.length > 0) {
      await prisma.rolePermission.createMany({ data: permRows.map((r) => ({ ...r, roleId: role.id })) });
    }

    return Response.json({ id: role.id, name: role.name }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return Response.json({ error: "A role with this name already exists" }, { status: 409 });
    }
    throw e;
  }
}
