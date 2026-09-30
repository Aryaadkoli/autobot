import { z } from "zod";
import { requireAccountSession } from "@/auth";
import { prisma } from "@/lib/db";

const BodySchema = z.object({
  phone: z.string().trim().max(32).nullable(),
});

// Only phone for now — name is cached in the JWT (see auth.ts) and
// changing it here wouldn't show up anywhere reading `session.name` until
// a re-login, so it's left alone rather than half-wiring a sync path
// nothing asked for. Phone is never cached in the JWT (fetched fresh in
// the dashboard layout on every render), so it can just live in the DB.
export async function PATCH(req: Request) {
  let session;
  try {
    session = await requireAccountSession();
  } catch {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { phone } = parsed.data;

  await prisma.account.update({
    where: { id: session.accountId },
    data: { phone: phone || null },
  });

  return Response.json({ phone: phone || null });
}
