import { z } from "zod";
import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";

const BodySchema = z.object({
  dailyCapPerContact: z.coerce.number().int().min(1).max(50),
  quietHoursStart: z.coerce.number().int().min(0).max(23),
  quietHoursEnd: z.coerce.number().int().min(0).max(23),
});

export async function PATCH(req: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (session.role !== "OWNER") {
    return Response.json(
      { error: "Only the account owner can change sending limits" },
      { status: 403 }
    );
  }

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const tenant = await prisma.tenant.update({
    where: { id: session.tenantId },
    data: parsed.data,
    select: { dailyCapPerContact: true, quietHoursStart: true, quietHoursEnd: true },
  });

  return Response.json(tenant);
}
