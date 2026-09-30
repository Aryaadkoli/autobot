import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { consumePasswordResetToken, setAccountPassword } from "@/lib/password-reset";

const BodySchema = z.object({
  token: z.string().trim().min(1),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }
  const { token, newPassword } = parsed.data;

  // Keyed by the token itself, not an account — a stolen/guessed token
  // shouldn't get unlimited attempts even though it's already a random
  // 32-byte value.
  const { allowed } = await checkRateLimit(`reset-password:${token}`, 10, 15 * 60);
  if (!allowed) {
    return Response.json({ error: "Too many attempts — request a new reset link" }, { status: 429 });
  }

  const consumed = await consumePasswordResetToken(token);
  if (!consumed) {
    return Response.json({ error: "This reset link is invalid or has expired" }, { status: 400 });
  }

  await setAccountPassword(consumed.accountId, newPassword);
  return Response.json({ message: "Password updated" });
}
