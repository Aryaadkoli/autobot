import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";

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

  if (session.role !== "OWNER") {
    return Response.json(
      { error: "Only the account owner can remove teammates" },
      { status: 403 }
    );
  }

  const { id } = await params;

  if (id === session.userId) {
    return Response.json(
      { error: "You can't remove your own account" },
      { status: 400 }
    );
  }

  const user = await prisma.user.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!user) {
    return Response.json({ error: "Teammate not found" }, { status: 404 });
  }

  await prisma.user.delete({ where: { id } });

  return Response.json({ id });
}
