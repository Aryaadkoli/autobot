import { z } from "zod";

const TemplateVariableSchema = z.object({
  pos: z.number().int().min(1).max(20),
  source: z.string().trim().min(1).max(100),
});

export const TemplateInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  channel: z.enum(["WHATSAPP", "EMAIL"]),
  body: z.string().trim().min(1, "Message body is required").max(2000),
  metaCategory: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]).optional(),
  // Must exactly match a template already approved in Meta Business
  // Manager — approval happens on Meta's side, this app doesn't submit it.
  metaTemplateName: z.string().trim().max(512).optional(),
  metaLanguage: z.string().trim().max(10).optional(),
  mediaUrl: z.union([z.string().trim().url(), z.literal("")]).optional(),
  mediaType: z.enum(["IMAGE", "DOCUMENT"]).optional(),
  variables: z.array(TemplateVariableSchema).max(20).default([]),
});

export type TemplateInput = z.infer<typeof TemplateInputSchema>;
