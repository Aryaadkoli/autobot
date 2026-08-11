import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";
import { getOrCreateAccountForInvite } from "@/lib/accounts";
import { sendAccountEmail } from "@/lib/mailer";

// OWNER is intentionally not offered here — it's meant to be the single
// business owner account created at seed/signup time, not something
// granted through the team-management UI.
const UserInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z.string().trim().toLowerCase().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(100),
  role: z.enum(["ADMIN", "AGENT"]),
});

export async function GET() {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const users = await prisma.user.findMany({
    where: { tenantId: session.tenantId },
    select: { id: true, role: true, account: { select: { name: true, email: true } } },
    orderBy: { account: { name: "asc" } },
  });

  return Response.json(
    users.map((u) => ({ id: u.id, role: u.role, name: u.account.name, email: u.account.email }))
  );
}

export async function POST(req: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (session.role !== "OWNER") {
    return Response.json(
      { error: "Only the account owner can add teammates" },
      { status: 403 }
    );
  }

  const parsed = UserInputSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { name, email, password, role } = parsed.data;

  const { account, isNew } = await getOrCreateAccountForInvite(email, name, password);

  const existingMembership = await prisma.user.findFirst({
    where: { tenantId: session.tenantId, accountId: account.id },
  });
  if (existingMembership) {
    return Response.json(
      { error: "A teammate with this email already has access here" },
      { status: 409 }
    );
  }

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: session.tenantId },
    select: { name: true },
  });

  try {
    const user = await prisma.user.create({
      data: { tenantId: session.tenantId, accountId: account.id, role },
      select: { id: true, role: true },
    });

    await sendAccountEmail(
      email,
      `You've been added to ${tenant.name} on Autobot`,
      isNew
        ? `Hi ${name},\n\n${session.name} added you to ${tenant.name} on Autobot as ${role}.\n\nLog in at your Autobot URL with:\nEmail: ${email}\nTemporary password: ${password}\n\nYou can change this password after logging in.`
        : `Hi ${name},\n\n${session.name} added you to ${tenant.name} on Autobot as ${role}. Log in with your existing Autobot email and password — after logging in you may need to pick this business if you're part of more than one.`
    );

    return Response.json({ id: user.id, role: user.role, name, email }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return Response.json(
        { error: "A teammate with this email already has access here" },
        { status: 409 }
      );
    }
    throw e;
  }
}
