import { randomBytes, createHash } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

const TOKEN_TTL_MINUTES = 60;

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

// The raw token goes in the emailed link and is never stored — only its
// hash is, so a database leak alone can never be used to reset an
// account's password (same reasoning as never storing plaintext
// passwords). Returns the raw token for the caller to put in the email.
export async function createPasswordResetToken(accountId: string): Promise<string> {
  const rawToken = randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: {
      accountId,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000),
    },
  });
  return rawToken;
}

// Null if the token is unknown, expired, or already used — callers give
// the same generic "invalid or expired link" error in every case rather
// than distinguishing them, so a guess can't be narrowed down.
export async function consumePasswordResetToken(rawToken: string): Promise<{ accountId: string } | null> {
  const tokenHash = hashToken(rawToken);
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return null;
  }
  await prisma.passwordResetToken.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });
  return { accountId: record.accountId };
}

export async function setAccountPassword(accountId: string, newPassword: string): Promise<void> {
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.account.update({ where: { id: accountId }, data: { passwordHash } });
}
