import type { PermissionMap } from "@/lib/permissions";

// Extends NextAuth's built-in types with the fields auth.ts actually puts on the session/JWT — avoids `any` scattered through the callbacks.
export type Membership = {
  userId: string;
  tenantId: string;
  tenantName: string;
  role: string;
  permissions: PermissionMap;
};

declare module "next-auth" {
  interface User {
    memberships?: Membership[];
  }

  interface Session {
    // Deliberately not intersected with DefaultSession["user"] — its `id?: string` would collapse against this module's `id: string | null` under intersection.
    user: AppSessionUser;
  }
}

// JWT isn't augmented here — next-auth re-exports it from a nested @auth/core copy that a root-level `declare module` doesn't reliably merge with; auth.ts casts the token locally instead.
export type AppJWT = {
  accountId?: string;
  userId?: string;
  tenantId?: string;
  role?: string;
  permissions?: PermissionMap;
  name?: string | null;
  email?: string | null;
  memberships?: Membership[];
};

export type AppSessionUser = {
  accountId: string;
  id: string | null;
  tenantId: string | null;
  role: string | null;
  permissions: PermissionMap | null;
  memberships: Membership[];
  name?: string | null;
  email?: string | null;
};
