import { z } from "zod";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { createPasswordResetToken } from "@/lib/password-reset";
import { sendAccountEmail } from "@/lib/mailer";

const BodySchema = z.object({ email: z.string().trim().email() });

// Same 5-attempts/15-min throttle as login/signup, keyed by email. Always
// returns the identical generic message whether or not that email has an
// account — the response itself must never be a way to check which emails
// are registered.
export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: "Enter a valid email address" }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase();

  const { allowed } = await checkRateLimit(`forgot-password:${email}`, 5, 15 * 60);
  const genericResponse = Response.json({
    message: "If an account exists for that email, a reset link is on its way.",
  });
  if (!allowed) return genericResponse;

  const account = await prisma.account.findUnique({ where: { email } });
  if (!account) return genericResponse;

  const rawToken = await createPasswordResetToken(account.id);
  const baseUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`;

  await sendAccountEmail(
    email,
    "Reset your Autobot password",
    `Hi ${account.name},\n\nSomeone (hopefully you) asked to reset your Autobot password. This link works once and expires in 1 hour:\n${resetUrl}\n\nIf you didn't request this, you can ignore this email — your password won't change.`
  );

  return genericResponse;
}
