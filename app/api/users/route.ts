import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireSession } from "@/auth";
import { prisma, prismaIncludingDeleted } from "@/lib/db";
import { getOrCreateAccountForInvite } from "@/lib/accounts";
import { sendAccountEmail } from "@/lib/mailer";
import { requirePermission } from "@/lib/permissions";

// OWNER is intentionally not offered here — it's meant to be the single
// business owner account created at seed/signup time, not something
// granted through the team-management UI.
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
  // Only a true OWNER can hand out CO_OWNER — a CO_OWNER granting
  // someone else co-ownership would be able to bootstrap its way to
  // unrestricted control, defeating the one safety rail CO_OWNER has
  // (see DELETE below).
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

  // The (tenantId, accountId) constraint is a real, unconditional unique
  // index (see schema.prisma) — if this email was ever removed from
  // this tenant before, its User row still physically exists, just
  // soft-deleted, and a plain .create() would hit that constraint. Look
  // for it via the unfiltered client and resurrect it instead of trying
  // to insert a duplicate.
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
