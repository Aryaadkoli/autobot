import { Prisma } from "@prisma/client";
import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import { LeadInputSchema, assertTagsBelongToTenant } from "./schema";

export async function POST(req: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
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
  const { tenantId } = session;

  const phone = normalizePhone(rawPhone);
  if (!phone) {
    return Response.json({ error: "Invalid phone number" }, { status: 400 });
  }

  const tagError = await assertTagsBelongToTenant(tenantId, tagIds);
  if (tagError) return Response.json({ error: tagError }, { status: 400 });

  const existing = await prisma.contact.findUnique({
    where: { tenantId_phone: { tenantId, phone } },
  });
  if (existing) {
    return Response.json(
      { error: "A lead with this phone number already exists" },
      { status: 409 }
    );
  }

  let businessTypeId: string | undefined;
  if (businessType) {
    const bt = await prisma.businessType.upsert({
      where: { tenantId_name: { tenantId, name: businessType } },
      update: {},
      create: { tenantId, name: businessType },
    });
    businessTypeId = bt.id;
  }

  const attributes: Prisma.InputJsonValue = {
    stage,
    ...(city ? { city } : {}),
  };

  let contact;
  try {
    contact = await prisma.contact.create({
      data: {
        tenantId,
        phone,
        name: name && name.length > 0 ? name : null,
        businessTypeId,
        attributes,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return Response.json(
        { error: "A lead with this phone number already exists" },
        { status: 409 }
      );
    }
    throw e;
  }

  if (tagIds.length > 0) {
    await prisma.contactTag.createMany({
      data: tagIds.map((tagId) => ({ contactId: contact.id, tagId })),
      skipDuplicates: true,
    });
  }

  await prisma.event.create({
    data: { tenantId, contactId: contact.id, type: "IMPORTED" },
  });

  return Response.json({ id: contact.id }, { status: 201 });
}
