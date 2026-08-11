import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import type { Membership, AppJWT, AppSessionUser } from "@/types/next-auth";

// Central auth config. Everything security-related lives in this file.
//
// Identity vs. tenant, since v2: signing in authenticates an Account
// (email+password, global) — it does NOT by itself pick a Tenant. The JWT
// carries the full list of that Account's tenant memberships
// (token.memberships) plus, once one is chosen, token.tenantId/userId/role
// for the currently-active one. Every DB query in the app still filters
// on tenantId exactly as before — requireSession() below is unchanged in
// shape, it just now depends on a tenant having been selected first.
//
// Auto-selection: exactly one membership → select it immediately, no
// extra step for the common single-tenant case. Zero memberships or two+
// → tenantId stays unset until the dashboard layout redirects to the
// empty-state page or /select-tenant, which calls switchTenant() (a
// Server Action using `unstable_update`, not a full re-login) to fill it
// in.
//
// Session lifetime: JWT strategy, no separate refresh token — NextAuth's
// own rolling-session mechanism is the equivalent (see session{} below):
// the token carries its own expiry, and gets silently re-issued with a
// fresh one on any request older than updateAge, up to maxAge total. A
// user who's actively using the app never sees a re-login prompt; one
// who walks away for over MAX_SESSION_DAYS does.
const MAX_SESSION_DAYS = 14;
const SESSION_REFRESH_HOURS = 12;

// Login brute-force protection — five wrong passwords for the same email
// in fifteen minutes and the sixth attempt is rejected outright, correct
// password or not, until the window resets. Keyed on email (not IP):
// the threat this defends against is guessing one known account's
// password, which is email-scoped regardless of how many IPs an attacker
// rotates through.
const LOGIN_ATTEMPT_LIMIT = 5;
const LOGIN_ATTEMPT_WINDOW_SECONDS = 15 * 60;

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  session: {
    strategy: "jwt",
    maxAge: MAX_SESSION_DAYS * 24 * 60 * 60,
    updateAge: SESSION_REFRESH_HOURS * 60 * 60,
  },
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
        if (!allowed) return null; // same "no" as a wrong password — don't reveal the throttle to an attacker

        const account = await prisma.account.findUnique({ where: { email } });
        if (!account) return null;

        const ok = await bcrypt.compare(password, account.passwordHash);
        if (!ok) return null;

        const memberships = await prisma.user.findMany({
          where: { accountId: account.id },
          include: { tenant: { select: { name: true } } },
        });

        return {
          id: account.id,
          email: account.email,
          name: account.name,
          memberships: memberships.map((m) => ({
            userId: m.id,
            tenantId: m.tenantId,
            tenantName: m.tenant.name,
            role: m.role,
          })),
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user, trigger, session }) {
      // next-auth's JWT type is a nested re-export (see types/next-auth.d.ts)
      // that doesn't reliably accept ambient augmentation — cast once here
      // instead of `any`-ing every field access below.
      const t = token as AppJWT;

      if (user) {
        t.accountId = user.id;
        t.name = user.name;
        t.email = user.email;
        const memberships = user.memberships ?? [];
        t.memberships = memberships;
        selectTenant(t, memberships.length === 1 ? memberships[0].tenantId : undefined, memberships);
      }

      // Fired by unstable_update({ user: { tenantId } }) from the
      // /select-tenant Server Action — swaps the active tenant on an
      // already-issued token without a full re-login.
      const requestedTenantId = (session as { user?: { tenantId?: string } } | undefined)?.user?.tenantId;
      if (trigger === "update" && requestedTenantId) {
        selectTenant(t, requestedTenantId, t.memberships ?? []);
      }

      return t;
    },
    session({ session, token }) {
      // Same nested-package situation as JWT (see AppJWT above) — the
      // callback's own `session` param type comes from next-auth's
      // internal nested @auth/core copy, which the top-level
      // `declare module "next-auth"` augmentation (used successfully by
      // auth()'s return type elsewhere in this file) doesn't reach.
      const t = token as AppJWT;
      const user = session.user as unknown as AppSessionUser;
      user.accountId = t.accountId ?? "";
      user.id = t.userId ?? null;
      user.tenantId = t.tenantId ?? null;
      user.role = t.role ?? null;
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
  } else {
    token.tenantId = undefined;
    token.userId = undefined;
    token.role = undefined;
  }
}

// Used by every server component / API route that touches tenant-scoped
// data. Throws if not signed in OR if a tenant hasn't been selected yet
// (the dashboard layout is what actually handles that second case
// gracefully — this is the safety net for anything reached directly).
export async function requireSession() {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated");
  const tenantId = session.user.tenantId;
  if (!tenantId) throw new Error("No tenant selected");
  return {
    userId: session.user.id as string,
    tenantId,
    role: session.user.role as string,
    name: session.user.name ?? "",
    email: session.user.email ?? "",
  };
}

// For places that need identity but not necessarily a selected tenant —
// the dashboard layout's gate, the empty-state page, /select-tenant.
export async function requireAccountSession() {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated");
  return {
    accountId: session.user.accountId,
    name: session.user.name ?? "",
    email: session.user.email ?? "",
    tenantId: session.user.tenantId,
    role: session.user.role,
    memberships: session.user.memberships ?? [],
  };
}
