import { z } from "zod";
import { requireAccountSession, unstable_update } from "@/auth";
import { createOrganizationForAccount } from "@/lib/accounts";

const OrganizationInputSchema = z.object({
  businessName: z.string().trim().min(1, "Business name is required").max(200),
});

// Lets an already-signed-in Account spin up a new Tenant without
// re-entering a password (the session already proves who they are) —
// either an OWNER adding another business, or a zero-membership Account
// (NoTenantEmptyState's "Create your own business") making its first.
// Not open to CO_OWNER/MEMBER/custom roles who already belong to a
// tenant but aren't its OWNER — same "owners only" framing the rest of
// the app uses for tenant-shaping actions (e.g. only an OWNER can grant
// CO_OWNER).
export async function POST(req: Request) {
  let session;
  try {
    session = await requireAccountSession();
  } catch {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const eligible = session.role === "OWNER" || session.memberships.length === 0;
  if (!eligible) {
    return Response.json(
      { error: "Only an owner can create a new organization" },
      { status: 403 }
    );
  }

  const parsed = OrganizationInputSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const tenant = await createOrganizationForAccount({
    accountId: session.accountId,
    businessName: parsed.data.businessName,
    name: session.name,
    email: session.email,
  });

  // Without this, the new membership exists in the DB but the caller's
  // own JWT (which still lists only their old memberships) wouldn't know
  // about it until they logged out and back in — refreshMemberships
  // re-queries the DB inside auth.ts's jwt callback, tenantId then makes
  // the new org the active one immediately.
  await unstable_update({
    user: { refreshMemberships: true, tenantId: tenant.id } as never,
  });

  return Response.json({ id: tenant.id, name: tenant.name }, { status: 201 });
}
