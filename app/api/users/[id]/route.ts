import { z } from "zod";
import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";
import { requirePermission, canRemoveTeamMember } from "@/lib/permissions";

const PatchSchema = z.object({ roleId: z.string().min(1, "Role is required") });

// Changing a teammate's role — same hierarchy rule as removing one
// (lib/team-hierarchy.ts): if you can't remove an OWNER/CO_OWNER, you
// can't demote them either, and only the literal OWNER can grant CO_OWNER.
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

  if (id === session.userId) {
    return Response.json({ error: "You can't change your own role" }, { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: { id, tenantId: session.tenantId },
    include: { role: { select: { name: true } } },
  });
  if (!user) {
    return Response.json({ error: "Teammate not found" }, { status: 404 });
  }
  if (!canRemoveTeamMember(session.role, user.role.name)) {
    return Response.json(
      { error: "Only the owner can change an owner or co-owner's role" },
      { status: 403 }
    );
  }

  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: "Role is required" }, { status: 400 });
  }

  const role = await prisma.role.findFirst({
    where: { id: parsed.data.roleId, tenantId: session.tenantId },
  });
  if (!role || role.name === "OWNER") {
    return Response.json({ error: "Invalid role" }, { status: 400 });
  }
  if (role.name === "CO_OWNER" && session.role !== "OWNER") {
    return Response.json({ error: "Only the owner can grant co-owner" }, { status: 403 });
  }

  await prisma.user.update({ where: { id }, data: { roleId: role.id } });
  return Response.json({ id, role: role.name });
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
  const denied = requirePermission(session, "TEAM", "edit");
  if (denied) return denied;

  const { id } = await params;

  if (id === session.userId) {
    return Response.json(
      { error: "You can't remove your own account" },
      { status: 400 }
    );
  }

  const user = await prisma.user.findFirst({
    where: { id, tenantId: session.tenantId },
    include: { role: { select: { name: true } } },
  });
  if (!user) {
    return Response.json({ error: "Teammate not found" }, { status: 404 });
  }

  // Removing an OWNER/CO_OWNER is kept OWNER-only so a co-owner can never lock out the owner (or another co-owner) — same rule the Settings UI uses to hide the Remove button (lib/team-hierarchy.ts).
  if (!canRemoveTeamMember(session.role, user.role.name)) {
    return Response.json(
      { error: "Only the owner can remove an owner or co-owner" },
      { status: 403 }
    );
  }

  await prisma.user.delete({ where: { id } });

  return Response.json({ id });
}
