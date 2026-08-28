import type { Module } from "@prisma/client";
import { prisma } from "./db";

export const MODULES: Module[] = ["LEADS", "TEMPLATES", "CAMPAIGNS", "WORKFLOWS", "ANALYTICS", "TEAM", "SETTINGS"];

export type PermissionMap = Record<Module, { canView: boolean; canEdit: boolean }>;

function emptyPermissions(): PermissionMap {
  return Object.fromEntries(MODULES.map((m) => [m, { canView: false, canEdit: false }])) as PermissionMap;
}

function fullPermissions(): PermissionMap {
  return Object.fromEntries(MODULES.map((m) => [m, { canView: true, canEdit: true }])) as PermissionMap;
}

// OWNER and CO_OWNER bypass the permission system entirely — full
// view+edit on everything, no RolePermission rows needed for them.
// Every other role (MEMBER, or a custom one) is governed by whatever
// rows actually exist; a module with no row is no access, same as
// canView/canEdit both false.
export function isOwnerTier(roleName: string): boolean {
  return roleName === "OWNER" || roleName === "CO_OWNER";
}

// A sane starting point for a freshly-created MEMBER role or a new
// custom role that didn't specify its own permissions: can see the
// day-to-day work areas, can't edit anything, no visibility into the
// team or WhatsApp/sending settings.
export function defaultMemberPermissions(): PermissionMap {
  const perms = emptyPermissions();
  for (const m of ["LEADS", "TEMPLATES", "CAMPAIGNS", "WORKFLOWS", "ANALYTICS"] as Module[]) {
    perms[m] = { canView: true, canEdit: false };
  }
  return perms;
}

// Computes the effective permission map for a role — used both when
// building the session at login (auth.ts embeds this in the JWT so
// every request's permission check is a JWT read, not a DB query) and
// anywhere else that needs a fresh read (e.g. right after an owner
// edits a role's permissions, before the affected users next log in).
export async function computePermissions(roleId: string, roleName: string): Promise<PermissionMap> {
  if (isOwnerTier(roleName)) return fullPermissions();
  const rows = await prisma.rolePermission.findMany({ where: { roleId } });
  const perms = emptyPermissions();
  for (const row of rows) {
    perms[row.module] = { canView: row.canView, canEdit: row.canEdit };
  }
  return perms;
}

export function canView(permissions: PermissionMap, module: Module): boolean {
  return permissions[module]?.canView ?? false;
}

export function canEdit(permissions: PermissionMap, module: Module): boolean {
  return permissions[module]?.canEdit ?? false;
}

// For API routes: returns a 403 Response if the session's permissions
// don't allow `action` on `module`, or null if the request should
// proceed. Usage: `const denied = requirePermission(session, "LEADS",
// "edit"); if (denied) return denied;`
export function requirePermission(
  session: { permissions: PermissionMap },
  module: Module,
  action: "view" | "edit"
): Response | null {
  const allowed = action === "view" ? canView(session.permissions, module) : canEdit(session.permissions, module);
  if (allowed) return null;
  return Response.json({ error: "You don't have permission to do that" }, { status: 403 });
}
