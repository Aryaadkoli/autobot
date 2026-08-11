import { Prisma } from "@prisma/client";
import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import { outcomeLabelFromDefinition } from "@/core/workflow/outcome-label";
import { LeadInputSchema, assertTagsBelongToTenant } from "../schema";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;

  const contact = await prisma.contact.findFirst({
    where: { id, tenantId: session.tenantId },
    include: { businessType: true, tags: { include: { tag: true } } },
  });
  if (!contact) {
    return Response.json({ error: "Lead not found" }, { status: 404 });
  }

  const [events, instances] = await Promise.all([
    prisma.event.findMany({
      where: { tenantId: session.tenantId, contactId: id },
      orderBy: { occurredAt: "desc" },
      take: 50,
    }),
    prisma.sequenceInstance.findMany({
      where: { tenantId: session.tenantId, contactId: id },
      orderBy: { startedAt: "desc" },
      take: 5,
      include: { workflow: { select: { name: true, definition: true } } },
    }),
  ]);

  return Response.json({
    contact: {
      id: contact.id,
      name: contact.name,
      phone: contact.phone,
      businessType: contact.businessType?.name ?? null,
      attributes: contact.attributes,
      tags: contact.tags.map((t) => ({ id: t.tag.id, name: t.tag.name })),
    },
    events: events.map((e) => ({
      id: e.id,
      type: e.type,
      occurredAt: e.occurredAt,
    })),
    workflows: instances.map((inst) => ({
      id: inst.id,
      name: inst.workflow.name,
      status: inst.status,
      outcome:
        inst.status === "COMPLETED"
          ? outcomeLabelFromDefinition(inst.workflow.definition, inst.currentStepId)
          : null,
    })),
  });
}

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
  const { tenantId } = session;
  const { id } = await params;

  const existing = await prisma.contact.findFirst({ where: { id, tenantId } });
  if (!existing) {
    return Response.json({ error: "Lead not found" }, { status: 404 });
  }

  const parsed = LeadInputSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { name, phone: rawPhone, businessType, city, stage, tagIds } =
    parsed.data;

  const phone = normalizePhone(rawPhone);
  if (!phone) {
    return Response.json({ error: "Invalid phone number" }, { status: 400 });
  }

  const tagError = await assertTagsBelongToTenant(tenantId, tagIds);
  if (tagError) return Response.json({ error: tagError }, { status: 400 });

  if (phone !== existing.phone) {
    const clash = await prisma.contact.findUnique({
      where: { tenantId_phone: { tenantId, phone } },
    });
    if (clash) {
      return Response.json(
        { error: "Another lead already uses this phone number" },
        { status: 409 }
      );
    }
  }

  let businessTypeId: string | null = existing.businessTypeId;
  if (businessType) {
    const bt = await prisma.businessType.upsert({
      where: { tenantId_name: { tenantId, name: businessType } },
      update: {},
      create: { tenantId, name: businessType },
    });
    businessTypeId = bt.id;
  } else {
    businessTypeId = null;
  }

  const mergedAttributes: Record<string, unknown> = {
    ...((existing.attributes as Record<string, unknown>) ?? {}),
    stage,
  };
  if (city) mergedAttributes.city = city;
  else delete mergedAttributes.city;

  try {
    await prisma.contact.update({
      where: { id },
      data: {
        name: name && name.length > 0 ? name : null,
        businessTypeId,
        attributes: mergedAttributes as Prisma.InputJsonValue,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return Response.json(
        { error: "Another lead already uses this phone number" },
        { status: 409 }
      );
    }
    throw e;
  }

  const current = await prisma.contactTag.findMany({ where: { contactId: id } });
  const currentIds = new Set(current.map((t) => t.tagId));
  const nextIds = new Set(tagIds);

  const toRemove = [...currentIds].filter((t) => !nextIds.has(t));
  const toAdd = [...nextIds].filter((t) => !currentIds.has(t));

  await prisma.$transaction([
    ...(toRemove.length
      ? [
          prisma.contactTag.deleteMany({
            where: { contactId: id, tagId: { in: toRemove } },
          }),
        ]
      : []),
    ...(toAdd.length
      ? [
          prisma.contactTag.createMany({
            data: toAdd.map((tagId) => ({ contactId: id, tagId })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);

  return Response.json({ id });
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
  const { tenantId } = session;
  const { id } = await params;

  const existing = await prisma.contact.findFirst({ where: { id, tenantId } });
  if (!existing) {
    return Response.json({ error: "Lead not found" }, { status: 404 });
  }

  const messages = await prisma.message.findMany({
    where: { contactId: id },
    select: { id: true },
  });
  const messageIds = messages.map((m) => m.id);

  await prisma.$transaction([
    prisma.link.deleteMany({ where: { messageId: { in: messageIds } } }),
    prisma.message.deleteMany({ where: { contactId: id } }),
    prisma.sequenceInstance.deleteMany({ where: { contactId: id } }),
    prisma.event.deleteMany({ where: { contactId: id } }),
    prisma.contactTag.deleteMany({ where: { contactId: id } }),
    prisma.contact.delete({ where: { id } }),
  ]);

  return Response.json({ id });
}
