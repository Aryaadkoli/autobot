import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { isOwnerTier } from "@/lib/permissions";
import { getPhoneNumberInfo } from "@/core/channels/whatsapp";

export async function POST() {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!isOwnerTier(session.role)) {
    return Response.json({ error: "Only the owner or co-owner can test the WhatsApp connection" }, { status: 403 });
  }

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: session.tenantId },
    select: { waPhoneNumberId: true, waAccessTokenEnc: true },
  });

  if (!tenant.waPhoneNumberId || !tenant.waAccessTokenEnc) {
    return Response.json({ error: "WhatsApp isn't connected yet" }, { status: 400 });
  }

  const accessToken = decrypt(tenant.waAccessTokenEnc);
  const result = await getPhoneNumberInfo(tenant.waPhoneNumberId, accessToken);

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 502 });
  }

  return Response.json({
    verifiedName: result.verifiedName,
    displayPhoneNumber: result.displayPhoneNumber,
    qualityRating: result.qualityRating,
  });
}
