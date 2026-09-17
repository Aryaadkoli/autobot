// core/ never imports Next.js; routes call into these, never the other way around.
export type ProviderResult =
  | { ok: true; providerMessageId: string; costPaise?: number }
  | { ok: false; error: string };

export type OutgoingMessage = {
  to: string; // E.164 phone (WhatsApp) or email address
  body: string; // fully-rendered text — used for free-form sends/previews

  // When set, sends a real Meta "template" message; must exactly match an APPROVED template name in Meta Business Manager.
  templateName?: string;
  languageCode?: string;
  bodyParameters?: string[]; // ordered values for the template's {{1}},{{2}}...
  media?: { type: "IMAGE" | "DOCUMENT"; url: string }; // header media — must be a public HTTPS URL
};

export interface ChannelAdapter {
  readonly name: string;
  send(message: OutgoingMessage): Promise<ProviderResult>;
}
