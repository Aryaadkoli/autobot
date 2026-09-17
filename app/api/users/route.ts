import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireSession } from "@/auth";
import { prisma, prismaIncludingDeleted } from "@/lib/db";
import { getOrCreateAccountForInvite } from "@/lib/accounts";
import { sendAccountEmail } from "@/lib/mailer";
import { requirePermission } from "@/lib/permissions";

// OWNER is intentionally not offered here — granted only at seed/signup time, never via team-management.
const UserInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z.string().trim().toLowerCase().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(100),
  roleId: z.string().min(1, "Role is required"),
});

export async function GET() {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  const denied = requirePermission(session, "TEAM", "view");
  if (denied) return denied;

  const users = await prisma.user.findMany({
    where: { tenantId: session.tenantId },
    select: { id: true, role: { select: { name: true } }, account: { select: { name: true, email: true } } },
    orderBy: { account: { name: "asc" } },
  });

  return Response.json(
    users.map((u) => ({ id: u.id, role: u.role.name, name: u.account.name, email: u.account.email }))
  );
}

export async function POST(req: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const denied = requirePermission(session, "TEAM", "edit");
  if (denied) return denied;

  const parsed = UserInputSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { name, email, password, roleId } = parsed.data;

  const role = await prisma.role.findFirst({
    where: { id: roleId, tenantId: session.tenantId },
  });
  if (!role || role.name === "OWNER") {
    return Response.json({ error: "Invalid role" }, { status: 400 });
  }
  // Only OWNER can grant CO_OWNER — otherwise a CO_OWNER could bootstrap its way to unrestricted control.
  if (role.name === "CO_OWNER" && session.role !== "OWNER") {
    return Response.json({ error: "Only the owner can add a co-owner" }, { status: 403 });
  }

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

  // (tenantId, accountId) is a plain unique index, so a previously-removed (soft-deleted) row would collide with .create() — resurrect it instead.
  const priorMembership = await prismaIncludingDeleted.user.findFirst({
    where: { tenantId: session.tenantId, accountId: account.id },
  });

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: session.tenantId },
    select: { name: true },
  });

  try {
    const user = priorMembership
      ? await prismaIncludingDeleted.user.update({
          where: { id: priorMembership.id },
          data: { roleId: role.id, deletedAt: null },
          select: { id: true, role: { select: { name: true } } },
        })
      : await prisma.user.create({
          data: { tenantId: session.tenantId, accountId: account.id, roleId: role.id },
          select: { id: true, role: { select: { name: true } } },
        });

    await sendAccountEmail(
      email,
      `You've been added to ${tenant.name} on Autobot`,
      isNew
        ? `Hi ${name},\n\n${session.name} added you to ${tenant.name} on Autobot as ${role.name}.\n\nLog in at your Autobot URL with:\nEmail: ${email}\nTemporary password: ${password}\n\nYou can change this password after logging in.`
        : `Hi ${name},\n\n${session.name} added you to ${tenant.name} on Autobot as ${role.name}. Log in with your existing Autobot email and password — after logging in you may need to pick this business if you're part of more than one.`
    );

    return Response.json({ id: user.id, role: user.role.name, name, email }, { status: 201 });
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
