import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";

const TagInputSchema = z.object({
  name: z.string().trim().min(1, "Tag name is required").max(50),
});

export async function POST(req: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const parsed = TagInputSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid tag name" },
      { status: 400 }
    );
  }

  const existing = await prisma.tag.findFirst({
    where: {
      tenantId: session.tenantId,
      name: { equals: parsed.data.name, mode: "insensitive" },
    },
  });
  if (existing) {
    return Response.json(
      { error: "A tag with this name already exists" },
      { status: 409 }
    );
  }

  try {
    const tag = await prisma.tag.create({
      data: { tenantId: session.tenantId, name: parsed.data.name },
    });
    return Response.json(tag, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return Response.json(
        { error: "A tag with this name already exists" },
        { status: 409 }
      );
    }
    throw e;
  }
}
