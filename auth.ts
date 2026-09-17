import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { computePermissions, MODULES, type PermissionMap } from "@/lib/permissions";
import type { Membership, AppJWT, AppSessionUser } from "@/types/next-auth";

// Safe "no access to anything" default if a session somehow reaches requireSession() with no permissions (shouldn't happen post-login) — avoids `undefined` crashing every canView()/canEdit() call site.
const NO_PERMISSIONS: PermissionMap = Object.fromEntries(
  MODULES.map((m) => [m, { canView: false, canEdit: false }])
) as PermissionMap;

// Signing in authenticates an Account (global) but doesn't itself pick a Tenant — the JWT carries all memberships plus, once chosen, the active tenantId/userId/role. Exactly one membership auto-selects; zero or 2+ leaves tenantId unset until /select-tenant's switchTenant() (unstable_update, not a re-login) fills it in.
const MAX_SESSION_DAYS = 14;
const SESSION_REFRESH_HOURS = 12;

// Keyed on email, not IP: the threat is guessing one known account's password regardless of how many IPs an attacker rotates through.
const LOGIN_ATTEMPT_LIMIT = 5;
const LOGIN_ATTEMPT_WINDOW_SECONDS = 15 * 60;

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  session: {
    strategy: "jwt",
    maxAge: MAX_SESSION_DAYS * 24 * 60 * 60,
    updateAge: SESSION_REFRESH_HOURS * 60 * 60,
  },
  // Without this, `next start` throws NextAuth's "UntrustedHost" on the first request (dev mode trusts localhost automatically). Safe since deployment puts this behind Caddy as the only thing forwarding to it — if that changes, set AUTH_URL explicitly instead.
  trustHost: true,
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(creds) {
        const email = (creds?.email as string | undefined)?.toLowerCase().trim();
        const password = creds?.password as string | undefined;
        if (!email || !password) return null;

        const { allowed } = await checkRateLimit(
          `login:${email}`,
          LOGIN_ATTEMPT_LIMIT,
          LOGIN_ATTEMPT_WINDOW_SECONDS
        );
        if (!allowed) return null; // same "no" as a wrong password — don't reveal the throttle

        const account = await prisma.account.findUnique({ where: { email } });
        if (!account) return null;

        const ok = await bcrypt.compare(password, account.passwordHash);
        if (!ok) return null;

        const memberships = await prisma.user.findMany({
          where: { accountId: account.id },
          include: { tenant: { select: { name: true } }, role: { select: { id: true, name: true } } },
        });

        return {
          id: account.id,
          email: account.email,
          name: account.name,
          memberships: await Promise.all(
            memberships.map(async (m) => ({
              userId: m.id,
              tenantId: m.tenantId,
              tenantName: m.tenant.name,
              role: m.role.name,
              permissions: await computePermissions(m.role.id, m.role.name),
            }))
          ),
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user, trigger, session }) {
      // next-auth's JWT type doesn't reliably accept ambient augmentation (see types/next-auth.d.ts) — cast once here instead of `any`-ing every field access below.
      const t = token as AppJWT;

      if (user) {
        t.accountId = user.id;
        t.name = user.name;
        t.email = user.email;
        const memberships = user.memberships ?? [];
        t.memberships = memberships;
        selectTenant(t, memberships.length === 1 ? memberships[0].tenantId : undefined, memberships);
      }

      // Fired by /select-tenant's unstable_update({ user: { tenantId } }) — swaps the active tenant on an already-issued token without a full re-login.
      const requestedTenantId = (session as { user?: { tenantId?: string } } | undefined)?.user?.tenantId;
      if (trigger === "update" && requestedTenantId) {
        selectTenant(t, requestedTenantId, t.memberships ?? []);
      }

      return t;
    },
    session({ session, token }) {
      // Same nested-package situation as JWT above — this callback's `session` param type comes from next-auth's internal @auth/core copy, which the top-level `declare module` augmentation doesn't reach.
      const t = token as AppJWT;
      const user = session.user as unknown as AppSessionUser;
      user.accountId = t.accountId ?? "";
      user.id = t.userId ?? null;
      user.tenantId = t.tenantId ?? null;
      user.role = t.role ?? null;
      user.permissions = t.permissions ?? null;
      user.memberships = t.memberships ?? [];
      user.name = t.name ?? null;
      user.email = t.email ?? "";
      return session;
    },
  },
});

function selectTenant(token: AppJWT, tenantId: string | undefined, memberships: Membership[]) {
  const match = tenantId ? memberships.find((m) => m.tenantId === tenantId) : undefined;
  if (match) {
    token.tenantId = match.tenantId;
    token.userId = match.userId;
    token.role = match.role;
    token.permissions = match.permissions;
  } else {
    token.tenantId = undefined;
    token.userId = undefined;
    token.role = undefined;
    token.permissions = undefined;
  }
}

// Throws if not signed in OR if a tenant hasn't been selected yet — the dashboard layout handles that second case gracefully; this is the safety net for anything reached directly.
export async function requireSession() {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated");
  const tenantId = session.user.tenantId;
  if (!tenantId) throw new Error("No tenant selected");
  return {
    userId: session.user.id as string,
    tenantId,
    role: session.user.role as string,
    permissions: session.user.permissions ?? NO_PERMISSIONS,
    name: session.user.name ?? "",
    email: session.user.email ?? "",
  };
}

// For places that need identity but not necessarily a selected tenant — the dashboard layout's gate, the empty-state page, /select-tenant.
export async function requireAccountSession() {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated");
  return {
    accountId: session.user.accountId,
    name: session.user.name ?? "",
    email: session.user.email ?? "",
    tenantId: session.user.tenantId,
    role: session.user.role,
    permissions: session.user.permissions ?? NO_PERMISSIONS,
    memberships: session.user.memberships ?? [],
  };
}
