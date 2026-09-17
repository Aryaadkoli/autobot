import type { ChannelAdapter } from "./types";
import { MockAdapter } from "./mock";
import { WhatsAppAdapter } from "./whatsapp";
import { decrypt } from "@/lib/crypto";

// Falls back to the mock for Email (not built yet) and any tenant without WhatsApp connected, so the rest of the pipeline keeps working either way.
export function getChannelAdapter(
  channel: "WHATSAPP" | "EMAIL",
  tenant: { waPhoneNumberId: string | null; waAccessTokenEnc: string | null }
): ChannelAdapter {
  if (channel === "WHATSAPP" && tenant.waPhoneNumberId && tenant.waAccessTokenEnc) {
    const accessToken = decrypt(tenant.waAccessTokenEnc);
    return new WhatsAppAdapter(tenant.waPhoneNumberId, accessToken);
  }
  return new MockAdapter();
}
