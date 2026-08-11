import { z } from "zod";
import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";
import { importContacts } from "@/core/ingestion/upsert";

const BodySchema = z.object({
  filename: z.string().min(1).max(255),
  columnMapping: z.record(z.string(), z.string()),
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(5000),
  tag: z.string().trim().max(50).optional(),
});

export async function POST(req: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { filename, columnMapping, rows, tag } = parsed.data;

  if (!Object.values(columnMapping).includes("phone")) {
    return Response.json(
      { error: "Map at least one column to Phone" },
      { status: 400 }
    );
  }

  const result = await importContacts({
    tenantId: session.tenantId,
    rows,
    columnMapping,
    tagName: tag || undefined,
  });

  const importRecord = await prisma.import.create({
    data: {
      tenantId: session.tenantId,
      filename,
      columnMapping,
      status:
        result.totalRows > 0 && result.failedRows === result.totalRows
          ? "FAILED"
          : "DONE",
      totalRows: result.totalRows,
      importedRows: result.importedRows,
      failedRows: result.failedRows,
      errorReport: result.errorReport,
    },
  });

  return Response.json({ importId: importRecord.id, ...result });
}
