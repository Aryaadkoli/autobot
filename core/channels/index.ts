import type { ChannelAdapter } from "./types";
import { MockAdapter } from "./mock";
import { WhatsAppAdapter } from "./whatsapp";
import { decrypt } from "@/lib/crypto";

// Selects the real adapter once a tenant has WhatsApp credentials saved
// (Settings → WhatsApp connection). Falls back to the mock for Email
// (not built yet, see docs/BLUEPRINT.md Phase 6) and for any tenant that
// hasn't connected WhatsApp yet, so the rest of the pipeline (Message rows,
// Events, Activity timeline) keeps working either way.
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
