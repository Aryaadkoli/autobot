// Every channel (WhatsApp, email — real or mock) implements this same
// shape. core/ never imports Next.js; routes call into these, never the
// other way around. See docs/BLUEPRINT.md §"channels".
export type ProviderResult =
  | { ok: true; providerMessageId: string; costPaise?: number }
  | { ok: false; error: string };

export type OutgoingMessage = {
  to: string; // E.164 phone (WhatsApp) or email address
  body: string; // fully-rendered text — used for free-form sends/previews

  // When set, WhatsAppAdapter sends a real Meta "template" message instead
  // of free-form text. Required for any cold outbound message: Meta only
  // allows free-form text within an open 24h customer-service window.
  // templateName must exactly match an APPROVED template name in Meta
  // Business Manager (approval happens on Meta's side, not in this app).
  templateName?: string;
  languageCode?: string;
  bodyParameters?: string[]; // ordered values for the template's {{1}},{{2}}...
  media?: { type: "IMAGE" | "DOCUMENT"; url: string }; // header media — must be a public HTTPS URL
};

export interface ChannelAdapter {
  readonly name: string;
  send(message: OutgoingMessage): Promise<ProviderResult>;
}
