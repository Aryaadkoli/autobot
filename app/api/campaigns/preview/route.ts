import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const tagId = url.searchParams.get("tagId") || undefined;
  const stage = url.searchParams.get("stage") || undefined;

  const where = {
    tenantId: session.tenantId,
    ...(tagId ? { tags: { some: { tagId } } } : {}),
    ...(stage ? { attributes: { path: ["stage"], equals: stage } } : {}),
  };

  const [count, sample] = await Promise.all([
    prisma.contact.count({ where }),
    prisma.contact.findMany({
      where,
      select: { name: true, phone: true },
      take: 100,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return Response.json({
    count,
    sample: sample.map((c) => c.name ?? c.phone),
  });
}
