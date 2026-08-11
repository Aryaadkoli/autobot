import { z } from "zod";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";

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
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  });

  return Response.json(users);
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

  const existing = await prisma.user.findFirst({
    where: { tenantId: session.tenantId, email },
  });
  if (existing) {
    return Response.json(
      { error: "A teammate with this email already exists" },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const user = await prisma.user.create({
      data: { tenantId: session.tenantId, name, email, passwordHash, role },
      select: { id: true, name: true, email: true, role: true },
    });
    return Response.json(user, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return Response.json(
        { error: "A teammate with this email already exists" },
        { status: 409 }
      );
    }
    throw e;
  }
}
