// Extends NextAuth's built-in types with the fields auth.ts actually puts
// on the session/JWT — avoids `any` scattered through the callbacks.
export type Membership = { userId: string; tenantId: string; tenantName: string; role: string };

declare module "next-auth" {
  interface User {
    memberships?: Membership[];
  }

  interface Session {
    // Deliberately NOT intersected with DefaultSession["user"] — that
    // type's `id?: string` (from DefaultUser) collapses against this
    // module's `id: string | null` under intersection, since TS narrows
    // a property's type to the overlap of both sides. name/email are
    // repeated here instead of inherited.
    user: AppSessionUser;
  }
}

// NOTE: JWT isn't augmented here — next-auth re-exports it from a nested
// copy of @auth/core (node_modules/next-auth/node_modules/@auth/core),
// so a `declare module "@auth/core/jwt"` augmentation written from the
// project root doesn't reliably merge with it. auth.ts casts the token
// object locally instead of fighting that.
export type AppJWT = {
  accountId?: string;
  userId?: string;
  tenantId?: string;
  role?: string;
  name?: string | null;
  email?: string | null;
  memberships?: Membership[];
};

export type AppSessionUser = {
  accountId: string;
  id: string | null;
  tenantId: string | null;
  role: string | null;
  memberships: Membership[];
  name?: string | null;
  email?: string | null;
};
