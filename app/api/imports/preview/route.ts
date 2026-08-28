import { requireSession } from "@/auth";
import { requirePermission } from "@/lib/permissions";
import { parseWorkbook } from "@/core/ingestion/excel";
import { guessMapping } from "@/core/ingestion/mapper";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  const denied = requirePermission(session, "LEADS", "edit");
  if (denied) return denied;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return Response.json({ error: "File too large (max 5MB)" }, { status: 400 });
  }

  let headers: string[];
  let rows: Record<string, unknown>[];
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    ({ headers, rows } = parseWorkbook(buffer));
  } catch {
    return Response.json(
      { error: "Could not read this file. Is it a valid .xlsx or .csv?" },
      { status: 400 }
    );
  }

  if (rows.length === 0) {
    return Response.json({ error: "No rows found in file" }, { status: 400 });
  }

  return Response.json({
    filename: file.name,
    headers,
    rows,
    columnMapping: guessMapping(headers),
  });
}
