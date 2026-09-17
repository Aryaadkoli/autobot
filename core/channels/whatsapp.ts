import type { ChannelAdapter, OutgoingMessage, ProviderResult } from "./types";

const GRAPH_VERSION = "v21.0";

// Pure, network-free payload builders — kept separate from send() so they
// can be unit-tested against Meta's documented request shape without a
// live WhatsApp Business account.
export function buildTextPayload(message: OutgoingMessage) {
  return {
    messaging_product: "whatsapp",
    to: message.to,
    type: "text",
    text: { body: message.body },
  };
}

export function buildTemplatePayload(message: OutgoingMessage) {
  const components: Record<string, unknown>[] = [];

  if (message.media) {
    const mediaKey = message.media.type === "IMAGE" ? "image" : "document";
    components.push({
      type: "header",
      parameters: [{ type: mediaKey, [mediaKey]: { link: message.media.url } }],
    });
  }

  if (message.bodyParameters?.length) {
    components.push({
      type: "body",
      parameters: message.bodyParameters.map((text) => ({ type: "text", text })),
    });
  }

  return {
    messaging_product: "whatsapp",
    to: message.to,
    type: "template",
    template: {
      name: message.templateName,
      language: { code: message.languageCode ?? "en" },
      ...(components.length ? { components } : {}),
    },
  };
}

export type PhoneNumberInfoResult =
  | { ok: true; verifiedName: string; displayPhoneNumber: string; qualityRating: string }
  | { ok: false; error: string };

// Confirms credentials work and shows account health without spending on a real message send.
export async function getPhoneNumberInfo(
  phoneNumberId: string,
  accessToken: string
): Promise<PhoneNumberInfoResult> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}?fields=verified_name,display_phone_number,quality_rating`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data?.error?.message ?? "Could not fetch phone number info" };
    }
    return {
      ok: true,
      verifiedName: data.verified_name ?? "",
      displayPhoneNumber: data.display_phone_number ?? "",
      qualityRating: data.quality_rating ?? "UNKNOWN",
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

type RawTemplate = { language?: string; status?: string; category?: string };

export type TemplateApprovalResult =
  | { ok: true; status: string; category?: string }
  | { ok: false; error: string };

// Looks up a template's REAL approval status from Meta, instead of assuming approved.
export async function checkTemplateApproval(
  wabaId: string,
  templateName: string,
  languageCode: string,
  accessToken: string
): Promise<TemplateApprovalResult> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/message_templates?name=${encodeURIComponent(templateName)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data?.error?.message ?? "Could not check template" };
    }
    const templates = (data.data ?? []) as RawTemplate[];
    const match =
      templates.find((t) => t.language === languageCode) ?? templates[0];
    if (!match) {
      return {
        ok: false,
        error: "No template with this name found in your WhatsApp Business account",
      };
    }
    return { ok: true, status: match.status ?? "UNKNOWN", category: match.category };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

// Selected by core/channels/index.ts once a tenant has real credentials saved via Settings.
export class WhatsAppAdapter implements ChannelAdapter {
  readonly name = "whatsapp";

  constructor(
    private phoneNumberId: string,
    private accessToken: string
  ) {}

  async send(message: OutgoingMessage): Promise<ProviderResult> {
    // Cold outbound sends must use an approved template — free-form text only works within an open 24h customer-service window.
    const payload = message.templateName
      ? buildTemplatePayload(message)
      : buildTextPayload(message);

    try {
      const res = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${this.phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data?.error?.message ?? "WhatsApp send failed" };
      }
      return { ok: true, providerMessageId: data.messages?.[0]?.id ?? "" };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Network error" };
    }
  }
}
