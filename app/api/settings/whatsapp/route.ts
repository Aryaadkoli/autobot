import { z } from "zod";
import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/crypto";

const WhatsAppSettingsSchema = z.object({
  phoneNumberId: z.string().trim().min(1, "Phone Number ID is required").max(100),
  businessAcctId: z.string().trim().max(100).optional(),
  accessToken: z.string().trim().min(1, "Access token is required").max(2000),
});

export async function GET() {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: session.tenantId },
    select: { waPhoneNumberId: true, waBusinessAcctId: true, waAccessTokenEnc: true },
  });

  return Response.json({
    connected: Boolean(tenant.waPhoneNumberId && tenant.waAccessTokenEnc),
    phoneNumberId: tenant.waPhoneNumberId,
    businessAcctId: tenant.waBusinessAcctId,
    // Access token itself is never sent back to the browser once saved.
  });
}

export async function POST(req: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (session.role !== "OWNER") {
    return Response.json(
      { error: "Only the account owner can connect WhatsApp" },
      { status: 403 }
    );
  }

  const parsed = WhatsAppSettingsSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { phoneNumberId, businessAcctId, accessToken } = parsed.data;

  await prisma.tenant.update({
    where: { id: session.tenantId },
    data: {
      waPhoneNumberId: phoneNumberId,
      waBusinessAcctId: businessAcctId || null,
      waAccessTokenEnc: encrypt(accessToken),
    },
  });

  return Response.json({ connected: true });
}

export async function DELETE() {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (session.role !== "OWNER") {
    return Response.json(
      { error: "Only the account owner can disconnect WhatsApp" },
      { status: 403 }
    );
  }

  await prisma.tenant.update({
    where: { id: session.tenantId },
    data: { waPhoneNumberId: null, waBusinessAcctId: null, waAccessTokenEnc: null },
  });

  return Response.json({ connected: false });
}
