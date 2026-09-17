import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { sendAccountEmail } from "./mailer";
import { createSystemRoles } from "./roles";

// Shared by /api/signup and Settings' "add teammate" — both ultimately
// need "find or create the global Account for this email," they just
// differ in what happens if it already exists.

// Signup: the person typing this email is claiming to know its password
// (whether it's brand new or already exists as another tenant's owner).
export async function getOrCreateAccountForSignup(email: string, name: string, password: string) {
  const existing = await prisma.account.findUnique({ where: { email } });
  if (existing) {
    const ok = await bcrypt.compare(password, existing.passwordHash);
    if (!ok) {
      throw new Error(
        "An account with this email already exists — enter its password to add another business to it."
      );
    }
    return { account: existing, isNew: false };
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const account = await prisma.account.create({ data: { email, name, passwordHash } });
  return { account, isNew: true };
}

// Add-teammate: the OWNER is typing someone else's email — they can't
// prove that person's password, so an existing Account is reused as-is
// (the invitee logs in with whatever they already use elsewhere), and a
// brand new one is created with the temp password the owner set.
export async function getOrCreateAccountForInvite(email: string, name: string, tempPassword: string) {
  const existing = await prisma.account.findUnique({ where: { email } });
  if (existing) return { account: existing, isNew: false };
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  const account = await prisma.account.create({ data: { email, name, passwordHash } });
  return { account, isNew: true };
}

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "business";
}

// The "Create an account" flow from the login page — signs up a brand
// new business (Tenant) under this email's Account, creating the Account
// too if it doesn't exist yet. An existing Account just gets a second
// Tenant added to it (the exact "one email, two businesses" case
// /select-tenant exists for) — its password must match, same rule as any
// other Account access.
// Shared by signup and the in-app "create another organization" flow —
// both ultimately need a fresh Tenant, its three system Roles, and this
// Account made OWNER of it.
async function createTenantWithOwner(accountId: string, businessName: string) {
  let slug = slugify(businessName);
  let suffix = 1;
  while (await prisma.tenant.findUnique({ where: { slug } })) {
    suffix++;
    slug = `${slugify(businessName)}-${suffix}`;
  }

  const tenant = await prisma.tenant.create({ data: { name: businessName, slug } });
  const roles = await createSystemRoles(tenant.id);
  await prisma.user.create({
    data: { tenantId: tenant.id, accountId, roleId: roles.OWNER.id },
  });

  return tenant;
}

export async function signupNewBusiness({
  businessName,
  name,
  email,
  password,
}: {
  businessName: string;
  name: string;
  email: string;
  password: string;
}) {
  const { account, isNew } = await getOrCreateAccountForSignup(email, name, password);
  const tenant = await createTenantWithOwner(account.id, businessName);

  await sendAccountEmail(
    email,
    `${businessName} is ready on Autobot`,
    isNew
      ? `Hi ${name},\n\nWelcome to Autobot! ${businessName} is set up and ready — log in at your Autobot URL with:\nEmail: ${email}\nPassword: (the one you just chose)`
      : `Hi ${name},\n\n${businessName} has been added to your existing Autobot login (${email}). Since you're now part of more than one business, you'll be asked to pick one each time you log in.`
  );

  return { tenant, account };
}

// The in-app equivalent, used from Settings by someone who's already
// signed in and already an OWNER somewhere — no password re-entry needed
// since their session already proves who they are. Route handler
// (app/api/organizations/route.ts) restricts this to OWNER-role callers;
// this function itself doesn't re-check that, same division of
// responsibility as the rest of lib/accounts.ts.
export async function createOrganizationForAccount({
  accountId,
  businessName,
  name,
  email,
}: {
  accountId: string;
  businessName: string;
  name: string;
  email: string;
}) {
  const tenant = await createTenantWithOwner(accountId, businessName);

  await sendAccountEmail(
    email,
    `${businessName} is ready on Autobot`,
    `Hi ${name},\n\n${businessName} has been added to your Autobot login (${email}) as a new business you own. Switch to it anytime from the sidebar's "Switch business" link.`
  );

  return tenant;
}
