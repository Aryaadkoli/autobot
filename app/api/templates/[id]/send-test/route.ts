import { z } from "zod";
import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { sendTemplateToContact } from "@/core/channels/send";

const BodySchema = z.object({ leadId: z.string().min(1) });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  const denied = requirePermission(session, "TEMPLATES", "edit");
  if (denied) return denied;
  const { id: templateId } = await params;

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: "Missing leadId" }, { status: 400 });
  }
  const { leadId } = parsed.data;

  const [template, tenant, contact] = await Promise.all([
    prisma.messageTemplate.findFirst({
      where: { id: templateId, tenantId: session.tenantId },
    }),
    prisma.tenant.findUniqueOrThrow({ where: { id: session.tenantId } }),
    prisma.contact.findFirst({
      where: { id: leadId, tenantId: session.tenantId },
    }),
  ]);

  if (!template) {
    return Response.json({ error: "Template not found" }, { status: 404 });
  }
  if (!contact) {
    return Response.json({ error: "Lead not found" }, { status: 404 });
  }

  const outcome = await sendTemplateToContact({ template, tenant, contact });

  if (outcome.status === "skipped") {
    return Response.json({ error: outcome.reason }, { status: 400 });
  }
  if (outcome.status === "failed") {
    return Response.json(
      { error: outcome.error, messageId: outcome.messageId, renderedBody: outcome.renderedBody },
      { status: 502 }
    );
  }

  const adapterUsed = tenant.waPhoneNumberId && tenant.waAccessTokenEnc ? "whatsapp" : "mock";
  return Response.json({
    messageId: outcome.messageId,
    renderedBody: outcome.renderedBody,
    via: adapterUsed,
  });
}
