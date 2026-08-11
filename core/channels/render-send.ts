import type { Contact, MessageTemplate, Tenant } from "@prisma/client";
import { getChannelAdapter } from "./index";
import { renderTemplate, buildBodyParameters, type TemplateVariable } from "../workflow/render";
import type { ProviderResult } from "./types";

export type RenderedMessage = {
  to: string | null;
  renderedBody: string | null;
  bodyParameters: string[];
};

// Fills in a template's variables for a contact — pure, no network call,
// so the workflow engine can insert link-tracking rewrites between this
// and actually delivering the message.
export function renderMessage(template: MessageTemplate, contact: Contact): RenderedMessage {
  const to = template.channel === "EMAIL" ? contact.email : contact.phone;
  if (!to) return { to: null, renderedBody: null, bodyParameters: [] };

  const contactLike = {
    name: contact.name,
    phone: contact.phone,
    attributes: contact.attributes as Record<string, unknown> | null,
  };
  const variables = (template.variables ?? []) as TemplateVariable[];
  const bodyParameters = buildBodyParameters(variables, contactLike);

  let renderedBody = renderTemplate(template.body, contactLike);
  bodyParameters.forEach((value, i) => {
    renderedBody = renderedBody.split(`{{${i + 1}}}`).join(value);
  });

  return { to, renderedBody, bodyParameters };
}

// Actually calls the channel adapter with an already-rendered body.
export async function deliverRendered(
  template: MessageTemplate,
  tenant: Tenant,
  to: string,
  renderedBody: string,
  bodyParameters: string[]
): Promise<{ result: ProviderResult; adapterName: string }> {
  const adapter = getChannelAdapter(template.channel, tenant);
  const result = await adapter.send({
    to,
    body: renderedBody,
    templateName: template.metaTemplateName ?? undefined,
    languageCode: template.metaLanguage ?? undefined,
    bodyParameters: template.metaTemplateName ? bodyParameters : undefined,
    media:
      template.metaTemplateName && template.mediaUrl && template.mediaType
        ? { type: template.mediaType, url: template.mediaUrl }
        : undefined,
  });
  return { result, adapterName: adapter.name };
}

// The actual "fill in the template and call the channel adapter" step,
// shared by every send path that doesn't need to rewrite links first
// (Campaigns' immediate/scheduled sends) — only the gatekeeper checks and
// dedupeKey around it differ per caller.
export async function renderAndSend(
  template: MessageTemplate,
  tenant: Tenant,
  contact: Contact
): Promise<
  | { to: string; renderedBody: string; result: ProviderResult; adapterName: string }
  | { to: null; renderedBody: null; result: null; adapterName: null }
> {
  const rendered = renderMessage(template, contact);
  if (!rendered.to || rendered.renderedBody === null) {
    return { to: null, renderedBody: null, result: null, adapterName: null };
  }
  const { result, adapterName } = await deliverRendered(
    template,
    tenant,
    rendered.to,
    rendered.renderedBody,
    rendered.bodyParameters
  );
  return { to: rendered.to, renderedBody: rendered.renderedBody, result, adapterName };
}
