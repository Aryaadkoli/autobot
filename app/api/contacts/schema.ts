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
  tagIds: z.array(z.string()).max(50).default([]),
});

export type LeadInput = z.infer<typeof LeadInputSchema>;

// Guards against attaching another tenant's tag id to a lead — every tagId
// must resolve to a Tag owned by this tenant, or the whole request is rejected.
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
