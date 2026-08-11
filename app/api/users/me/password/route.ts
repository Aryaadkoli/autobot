import { z } from "zod";
import bcrypt from "bcryptjs";
import { requireAccountSession } from "@/auth";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";

const BodySchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

// Same brute-force protection as login (lib/rate-limit.ts) — this
// endpoint is another place someone gets to guess a password against a
// known-correct answer, so it needs the same throttle.
const ATTEMPT_LIMIT = 5;
const ATTEMPT_WINDOW_SECONDS = 15 * 60;

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
  const { currentPassword, newPassword } = parsed.data;

  const { allowed } = await checkRateLimit(
    `password-change:${session.accountId}`,
    ATTEMPT_LIMIT,
    ATTEMPT_WINDOW_SECONDS
  );
  if (!allowed) {
    return Response.json(
      { error: "Too many attempts — try again in a few minutes" },
      { status: 429 }
    );
  }

  const account = await prisma.account.findUnique({ where: { id: session.accountId } });
  if (!account) {
    return Response.json({ error: "Account not found" }, { status: 404 });
  }

  const ok = await bcrypt.compare(currentPassword, account.passwordHash);
  if (!ok) {
    return Response.json({ error: "Current password is incorrect" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.account.update({ where: { id: account.id }, data: { passwordHash } });

  return Response.json({ ok: true });
}
