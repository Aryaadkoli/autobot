import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";
import { requirePermission, canRemoveTeamMember } from "@/lib/permissions";

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
