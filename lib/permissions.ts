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

// OWNER/CO_OWNER bypass the permission system entirely (full access, no RolePermission rows needed); everything else is governed by whatever rows actually exist.
export function isOwnerTier(roleName: string): boolean {
  return roleName === "OWNER" || roleName === "CO_OWNER";
}

export function defaultMemberPermissions(): PermissionMap {
  const perms = emptyPermissions();
  for (const m of ["LEADS", "TEMPLATES", "CAMPAIGNS", "WORKFLOWS", "ANALYTICS"] as Module[]) {
    perms[m] = { canView: true, canEdit: false };
  }
  return perms;
}

// Embedded in the JWT at login (auth.ts) so most permission checks are a JWT read, not a DB query; also called for a fresh read right after an owner edits a role.
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

// Returns a 403 Response if disallowed, or null if the request should proceed.
export function requirePermission(
  session: { permissions: PermissionMap },
  module: Module,
  action: "view" | "edit"
): Response | null {
  const allowed = action === "view" ? canView(session.permissions, module) : canEdit(session.permissions, module);
  if (allowed) return null;
  return Response.json({ error: "You don't have permission to do that" }, { status: 403 });
}
