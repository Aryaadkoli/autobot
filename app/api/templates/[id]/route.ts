import { Prisma } from "@prisma/client";
import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { TemplateInputSchema } from "../schema";

export async function PATCH(
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
  const { id } = await params;

  const existing = await prisma.messageTemplate.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!existing) {
    return Response.json({ error: "Template not found" }, { status: 404 });
  }

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

  const clash = await prisma.messageTemplate.findFirst({
    where: { tenantId: session.tenantId, name, NOT: { id } },
  });
  if (clash) {
    return Response.json(
      { error: "A template with this name already exists" },
      { status: 409 }
    );
  }

  try {
    const updated = await prisma.messageTemplate.update({
      where: { id },
      data: {
        name,
        channel,
        body,
        metaCategory: channel === "WHATSAPP" ? metaCategory : null,
        metaTemplateName: channel === "WHATSAPP" ? metaTemplateName : null,
        metaLanguage: channel === "WHATSAPP" ? (metaLanguage || "en") : null,
        mediaUrl: mediaUrl || null,
        mediaType: mediaUrl ? mediaType : null,
        variables,
      },
    });
    return Response.json(updated);
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

export async function DELETE(
  _req: Request,
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
  const { id } = await params;

  const existing = await prisma.messageTemplate.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!existing) {
    return Response.json({ error: "Template not found" }, { status: 404 });
  }

  const pendingScheduled = await prisma.scheduledCampaign.count({
    where: { templateId: id, status: "PENDING" },
  });
  if (pendingScheduled > 0) {
    return Response.json(
      {
        error: `This template has ${pendingScheduled} scheduled campaign${
          pendingScheduled === 1 ? "" : "s"
        } pending — cancel ${pendingScheduled === 1 ? "it" : "them"} first.`,
      },
      { status: 400 }
    );
  }

  const [usageCount, campaignCount] = await Promise.all([
    prisma.message.count({ where: { templateId: id } }),
    prisma.campaign.count({ where: { templateId: id } }),
  ]);
  if (campaignCount > 0 && usageCount === 0) {
    // A campaign that skipped everyone (e.g. all opted out) leaves no
    // Message rows but still references the template — block deletion
    // here too, rather than letting it fail as a raw FK violation.
    return Response.json(
      {
        error: `This template was used in ${campaignCount} campaign${
          campaignCount === 1 ? "" : "s"
        } and can't be deleted (kept for history).`,
      },
      { status: 400 }
    );
  }
  if (usageCount > 0) {
    return Response.json(
      {
        error: `This template has been used in ${usageCount} message${
          usageCount === 1 ? "" : "s"
        } and can't be deleted (kept for history).`,
      },
      { status: 400 }
    );
  }

  await prisma.messageTemplate.delete({ where: { id } });

  return Response.json({ id });
}
