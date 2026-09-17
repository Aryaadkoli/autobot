// Framework-free — reused by the worker as well as Next.js code.
export type TemplateVariable = { pos: number; source: string };

type ContactLike = {
  name?: string | null;
  phone: string;
  attributes?: Record<string, unknown> | null;
};

function resolveSource(source: string, contact: ContactLike): string {
  if (source === "contact.name") return contact.name ?? "";
  if (source === "contact.phone") return contact.phone;
  if (source.startsWith("attributes.")) {
    const key = source.slice("attributes.".length);
    const value = contact.attributes?.[key];
    return value !== undefined && value !== null ? String(value) : "";
  }
  return "";
}

// Named-token style ({{name}}, {{phone}}, {{city}}) — used for free-form sends and the send-test preview.
export function renderTemplate(body: string, contact: ContactLike): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) => {
    if (key === "name") return contact.name ?? "";
    if (key === "phone") return contact.phone;
    const value = contact.attributes?.[key];
    return value !== undefined && value !== null ? String(value) : match;
  });
}

// Numbered-placeholder style ({{1}}, {{2}}, ...) — matches Meta's approved WhatsApp template format.
export function buildBodyParameters(
  variables: TemplateVariable[],
  contact: ContactLike
): string[] {
  return [...variables]
    .sort((a, b) => a.pos - b.pos)
    .map((v) => resolveSource(v.source, contact));
}
