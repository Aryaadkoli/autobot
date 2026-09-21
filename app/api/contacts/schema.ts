import { z } from "zod";
import { prisma } from "@/lib/db";

export const LeadInputSchema = z.object({
  name: z.string().trim().max(200).optional(),
  phone: z.string().trim().min(1, "Phone is required").max(32, "Phone is too long"),
  businessType: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  stage: z
    .enum(["new", "contacted", "interested", "converted", "lost"])
    .default("new"),
  // Distinct from `stage` above (the older, hardcoded Leads-page badge) —
  // these are the per-tenant Customer Status / Lead Stage taxonomy from
  // lib/lead-stages.ts. Always sent by the form (never omitted), null
  // meaning "not set", so this stays a full replace like the rest of this
  // schema rather than a partial patch.
  customerStatusId: z.string().trim().min(1).nullable().default(null),
  leadStageId: z.string().trim().min(1).nullable().default(null),
  tagIds: z.array(z.string()).max(50).default([]),
});

export type LeadInput = z.infer<typeof LeadInputSchema>;

// Rejects the whole request if any tagId doesn't resolve to a Tag owned by this tenant.
export async function assertTagsBelongToTenant(
  tenantId: string,
  tagIds: string[]
): Promise<string | null> {
  if (tagIds.length === 0) return null;
  const owned = await prisma.tag.count({
    where: { tenantId, id: { in: tagIds } },
  });
  if (owned !== new Set(tagIds).size) {
    return "One or more tags are invalid";
  }
  return null;
}
