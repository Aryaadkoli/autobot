import { prisma } from "./db";
import { defaultMemberPermissions } from "./permissions";

// The three roles every tenant is built around — session.role === "OWNER"
// checks throughout the app depend on a role with exactly this name
// existing, so these are seeded for every new tenant and can never be
// renamed or deleted (see Role.isSystem in schema.prisma). OWNER and
// CO_OWNER are permission-check-exempt (full access always — see
// lib/permissions.ts); MEMBER gets a real, editable set of permissions.
export const SYSTEM_ROLE_NAMES = ["OWNER", "CO_OWNER", "MEMBER"] as const;

// Creates the three system roles for a brand new tenant and returns them
// keyed by name for convenient lookup (e.g. roles.OWNER.id).
export async function createSystemRoles(tenantId: string) {
  const roles = await Promise.all(
    SYSTEM_ROLE_NAMES.map((name) =>
      prisma.role.create({ data: { tenantId, name, isSystem: true } })
    )
  );
  const byName = Object.fromEntries(roles.map((r) => [r.name, r])) as Record<
    (typeof SYSTEM_ROLE_NAMES)[number],
    (typeof roles)[number]
  >;

  const memberDefaults = defaultMemberPermissions();
  await prisma.rolePermission.createMany({
    data: Object.entries(memberDefaults).map(([module, p]) => ({
      roleId: byName.MEMBER.id,
      module: module as keyof typeof memberDefaults,
      canView: p.canView,
      canEdit: p.canEdit,
    })),
  });

  return byName;
}
