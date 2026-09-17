import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { sendAccountEmail } from "./mailer";
import { createSystemRoles } from "./roles";

// Signup claims to know this email's password (new or an existing owner's) — verified below; invite (further down) can't prove that, so it reuses the Account as-is instead.
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

// Existing Account is reused as-is (invitee keeps their own password); only a brand-new email gets the owner's temp password.
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

// An existing Account just gets a second Tenant added to it (the "one email, two businesses" case /select-tenant exists for) — password must still match.
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

  let slug = slugify(businessName);
  let suffix = 1;
  while (await prisma.tenant.findUnique({ where: { slug } })) {
    suffix++;
    slug = `${slugify(businessName)}-${suffix}`;
  }

  const tenant = await prisma.tenant.create({ data: { name: businessName, slug } });
  const roles = await createSystemRoles(tenant.id);
  await prisma.user.create({
    data: { tenantId: tenant.id, accountId: account.id, roleId: roles.OWNER.id },
  });

  await sendAccountEmail(
    email,
    `${businessName} is ready on Autobot`,
    isNew
      ? `Hi ${name},\n\nWelcome to Autobot! ${businessName} is set up and ready — log in at your Autobot URL with:\nEmail: ${email}\nPassword: (the one you just chose)`
      : `Hi ${name},\n\n${businessName} has been added to your existing Autobot login (${email}). Since you're now part of more than one business, you'll be asked to pick one each time you log in.`
  );

  return { tenant, account };
}
