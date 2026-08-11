import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { requireSession } from "@/auth";

const ALLOWED: Record<string, { ext: string; mediaType: "IMAGE" | "DOCUMENT" }> = {
  "image/jpeg": { ext: "jpg", mediaType: "IMAGE" },
  "image/png": { ext: "png", mediaType: "IMAGE" },
  "image/webp": { ext: "webp", mediaType: "IMAGE" },
  "application/pdf": { ext: "pdf", mediaType: "DOCUMENT" },
};

const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    await requireSession();
  } catch {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file uploaded" }, { status: 400 });
  }

  const meta = ALLOWED[file.type];
  if (!meta) {
    return Response.json(
      { error: "Only JPEG, PNG, WebP images or PDF documents are allowed" },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "File too large (max 5MB)" }, { status: 400 });
  }

  const dir = path.join(process.cwd(), "public", "uploads", "templates");
  await mkdir(dir, { recursive: true });
  const filename = `${randomUUID()}.${meta.ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, filename), buffer);

  const relativeUrl = `/uploads/templates/${filename}`;
  const base = process.env.APP_URL?.replace(/\/$/, "");

  return Response.json({
    url: base ? `${base}${relativeUrl}` : relativeUrl,
    mediaType: meta.mediaType,
    // Meta's servers must be able to fetch this URL over the public
    // internet to attach it to a message — a relative/localhost URL only
    // works for previewing inside this app, not for a real WhatsApp send.
    isPubliclyReachable: Boolean(base),
  });
}
