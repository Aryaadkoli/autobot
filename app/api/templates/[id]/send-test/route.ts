import { z } from "zod";
import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { normalizePhone } from "@/lib/phone";
import { renderMessage, deliverRendered } from "@/core/channels/render-send";

// A fixed, hardcoded test destination — deliberately not configurable and
// never a real tenant Contact. "Send test" exists only so someone can see
// what a template renders/looks like; it must never write a Message or
// Event row (so it can't skew analytics, lead history, or the daily send
// cap) and must never reach a real lead's phone.
const TEST_PHONE = "9980540448";

const BodySchema = z.object({ leadId: z.string().min(1).optional() });

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
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const { leadId } = parsed.data;

  const [template, tenant, lead] = await Promise.all([
    prisma.messageTemplate.findFirst({
      where: { id: templateId, tenantId: session.tenantId },
    }),
    prisma.tenant.findUniqueOrThrow({ where: { id: session.tenantId } }),
    leadId
      ? prisma.contact.findFirst({ where: { id: leadId, tenantId: session.tenantId } })
      : Promise.resolve(null),
  ]);

  if (!template) {
    return Response.json({ error: "Template not found" }, { status: 404 });
  }

  // Email has no equivalent fixed test address — a real lead's email is
  // still needed to preview an email template, but nothing gets persisted
  // either way (see below).
  if (template.channel === "EMAIL") {
    if (!lead?.email) {
      return Response.json(
        { error: "Pick a lead with an email on file to preview an email template" },
        { status: 400 }
      );
    }
    const rendered = renderMessage(template, lead);
    if (!rendered.to || rendered.renderedBody === null) {
      return Response.json({ error: "Could not render this template" }, { status: 400 });
    }
    const { result, adapterName } = await deliverRendered(
      template,
      tenant,
      rendered.to,
      rendered.renderedBody,
      rendered.bodyParameters
    );
    if (!result.ok) {
      return Response.json(
        { error: result.error, renderedBody: rendered.renderedBody },
        { status: 502 }
      );
    }
    return Response.json({ renderedBody: rendered.renderedBody, via: adapterName });
  }

  const testPhone = normalizePhone(TEST_PHONE);
  if (!testPhone) {
    return Response.json({ error: "Test phone number is misconfigured" }, { status: 500 });
  }

  // Personalized with the selected lead's name/attributes if one was
  // picked (so {{name}} etc. preview realistically), but the destination
  // is always the fixed test number regardless of that lead's real phone.
  const previewContact = {
    name: lead?.name ?? "Test Preview",
    phone: testPhone,
    email: null,
    attributes: lead?.attributes ?? null,
  };

  const rendered = renderMessage(template, previewContact);
  if (!rendered.to || rendered.renderedBody === null) {
    return Response.json({ error: "Could not render this template" }, { status: 400 });
  }

  const { result, adapterName } = await deliverRendered(
    template,
    tenant,
    rendered.to,
    rendered.renderedBody,
    rendered.bodyParameters
  );

  if (!result.ok) {
    return Response.json(
      { error: result.error, renderedBody: rendered.renderedBody },
      { status: 502 }
    );
  }

  return Response.json({ renderedBody: rendered.renderedBody, via: adapterName });
}
