import type { Prisma } from "@prisma/client";
import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

const HEADERS = [
  "Name",
  "Phone",
  "Email",
  "Business Type",
  "City",
  "Region",
  "Product",
  "Stage",
  "Customer Status",
  "Lead Stage",
  "Tags",
  "Added",
];

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// Streams in fixed-size batches via keyset pagination — same reasoning as
// the Leads page's server-side pagination: never load the whole result set
// into memory at once, so exporting doesn't fall over at real scale (this
// is exactly the operation that would matter most for a 700k+ lead tenant).
const BATCH_SIZE = 1000;

export async function GET(req: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  const denied = requirePermission(session, "LEADS", "view");
  if (denied) return denied;
  const { tenantId } = session;

  const url = new URL(req.url);
  const search = (url.searchParams.get("q") ?? "").trim();
  const stage = url.searchParams.get("stage") ?? "";
  const businessType = url.searchParams.get("businessType") ?? "";
  const customerStatus = url.searchParams.get("customerStatus") ?? "";
  const leadStage = url.searchParams.get("leadStage") ?? "";

  const where: Prisma.ContactWhereInput = {
    tenantId,
    ...(stage ? { attributes: { path: ["stage"], equals: stage } } : {}),
    ...(businessType ? { businessType: { name: businessType } } : {}),
    ...(customerStatus ? { customerStatusId: customerStatus } : {}),
    ...(leadStage ? { leadStageId: leadStage } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { phone: { contains: search } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(HEADERS.join(",") + "\n"));

      let cursor: string | undefined;
      for (;;) {
        const rows = await prisma.contact.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: BATCH_SIZE,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            attributes: true,
            createdAt: true,
            businessType: { select: { name: true } },
            customerStatus: { select: { name: true } },
            leadStage: { select: { name: true } },
            tags: { select: { tag: { select: { name: true } } } },
          },
        });
        if (rows.length === 0) break;

        let chunk = "";
        for (const c of rows) {
          const attrs = c.attributes as Record<string, unknown> | null;
          const fields = [
            c.name ?? "",
            c.phone,
            c.email ?? "",
            c.businessType?.name ?? "",
            (attrs?.city as string | undefined) ?? "",
            (attrs?.region as string | undefined) ?? "",
            (attrs?.product as string | undefined) ?? "",
            (attrs?.stage as string | undefined) ?? "new",
            c.customerStatus?.name ?? "",
            c.leadStage?.name ?? "",
            c.tags.map((t) => t.tag.name).join(";"),
            c.createdAt.toISOString(),
          ];
          chunk += fields.map((v) => csvField(String(v))).join(",") + "\n";
        }
        controller.enqueue(encoder.encode(chunk));

        cursor = rows[rows.length - 1].id;
        if (rows.length < BATCH_SIZE) break;
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="leads-export.csv"',
    },
  });
}
