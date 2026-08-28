import { z } from "zod";
import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { runCampaign } from "@/core/channels/campaign";

const BodySchema = z.object({
  templateId: z.string().min(1),
  tagId: z.string().optional(),
  stage: z.string().optional(),
});

export async function POST(req: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  const denied = requirePermission(session, "CAMPAIGNS", "edit");
  if (denied) return denied;

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const { templateId, tagId, stage } = parsed.data;

  const [template, tenant, tag] = await Promise.all([
    prisma.messageTemplate.findFirst({
      where: { id: templateId, tenantId: session.tenantId },
    }),
    prisma.tenant.findUniqueOrThrow({ where: { id: session.tenantId } }),
    tagId
      ? prisma.tag.findFirst({ where: { id: tagId, tenantId: session.tenantId } })
      : null,
  ]);
  if (!template) {
    return Response.json({ error: "Template not found" }, { status: 404 });
  }
  if (tagId && !tag) {
    return Response.json({ error: "Tag not found" }, { status: 404 });
  }

  const contacts = await prisma.contact.findMany({
    where: {
      tenantId: session.tenantId,
      ...(tagId ? { tags: { some: { tagId } } } : {}),
      ...(stage ? { attributes: { path: ["stage"], equals: stage } } : {}),
    },
    // No hard cap on the query — runCampaign() truncates for sending, but
    // the campaign history should still reflect the true match count.
    orderBy: { createdAt: "desc" },
  });

  const sourceParts = [];
  if (tag) sourceParts.push(`tag "${tag.name}"`);
  if (stage) sourceParts.push(`stage "${stage}"`);
  const source =
    sourceParts.length > 0 ? `Filter: ${sourceParts.join(", ")}` : "All leads";

  const result = await runCampaign({ template, tenant, contacts, source });

  return Response.json(result);
}
