import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { decrypt } from "@/lib/crypto";
import { checkTemplateApproval } from "@/core/channels/whatsapp";

const VALID_STATUSES = ["PENDING", "APPROVED", "REJECTED"];

export async function POST(
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

  const [template, tenant] = await Promise.all([
    prisma.messageTemplate.findFirst({
      where: { id, tenantId: session.tenantId },
    }),
    prisma.tenant.findUniqueOrThrow({
      where: { id: session.tenantId },
      select: { waBusinessAcctId: true, waAccessTokenEnc: true },
    }),
  ]);

  if (!template) {
    return Response.json({ error: "Template not found" }, { status: 404 });
  }
  if (!template.metaTemplateName) {
    return Response.json(
      { error: "Set an approved Meta template name on this template first" },
      { status: 400 }
    );
  }
  if (!tenant.waBusinessAcctId || !tenant.waAccessTokenEnc) {
    return Response.json(
      { error: "Connect WhatsApp in Settings first (need the WhatsApp Business Account ID)" },
      { status: 400 }
    );
  }

  const accessToken = decrypt(tenant.waAccessTokenEnc);
  const result = await checkTemplateApproval(
    tenant.waBusinessAcctId,
    template.metaTemplateName,
    template.metaLanguage ?? "en",
    accessToken
  );

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 502 });
  }

  const status = VALID_STATUSES.includes(result.status) ? result.status : "PENDING";
  await prisma.messageTemplate.update({
    where: { id },
    data: { approvalStatus: status as "PENDING" | "APPROVED" | "REJECTED" },
  });

  return Response.json({ status, category: result.category });
}
