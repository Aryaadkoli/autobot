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
  const { id } = await params;

  const scheduled = await prisma.scheduledCampaign.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!scheduled) {
    return Response.json({ error: "Scheduled campaign not found" }, { status: 404 });
  }
  if (scheduled.status !== "PENDING") {
    return Response.json(
      { error: "Only a pending scheduled campaign can be cancelled" },
      { status: 400 }
    );
  }

  await prisma.scheduledCampaign.update({
    where: { id },
    data: { status: "CANCELLED" },
  });

  return Response.json({ id });
}
