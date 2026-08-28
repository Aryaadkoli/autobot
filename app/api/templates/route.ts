import { Prisma } from "@prisma/client";
import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { TemplateInputSchema } from "./schema";

export async function GET() {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  const denied = requirePermission(session, "TEMPLATES", "view");
  if (denied) return denied;

  const templates = await prisma.messageTemplate.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { createdAt: "desc" },
  });

  return Response.json(templates);
}

export async function POST(req: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  const denied = requirePermission(session, "TEMPLATES", "edit");
  if (denied) return denied;

  const parsed = TemplateInputSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const {
    name,
    channel,
    body,
    metaCategory,
    metaTemplateName,
    metaLanguage,
    mediaUrl,
    mediaType,
    variables,
  } = parsed.data;

  const existing = await prisma.messageTemplate.findFirst({
    where: { tenantId: session.tenantId, name },
  });
  if (existing) {
    return Response.json(
      { error: "A template with this name already exists" },
      { status: 409 }
    );
  }

  try {
    const template = await prisma.messageTemplate.create({
      data: {
        tenantId: session.tenantId,
        name,
        channel,
        body,
        metaCategory: channel === "WHATSAPP" ? metaCategory : undefined,
        metaTemplateName: channel === "WHATSAPP" ? metaTemplateName : undefined,
        metaLanguage: channel === "WHATSAPP" ? (metaLanguage || "en") : undefined,
        mediaUrl: mediaUrl || undefined,
        mediaType: mediaUrl ? mediaType : undefined,
        variables,
        // No real Meta/DLT approval pipeline in this app yet — mark usable
        // immediately so mock/test sends work. A real cold WhatsApp send
        // still requires metaTemplateName to reference an ALREADY-approved
        // Meta template; this flag doesn't grant that approval.
        approvalStatus: "APPROVED",
      },
    });
    return Response.json(template, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return Response.json(
        { error: "A template with this name already exists" },
        { status: 409 }
      );
    }
    throw e;
  }
}
