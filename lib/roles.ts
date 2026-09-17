import { prisma } from "./db";
import { defaultMemberPermissions } from "./permissions";

// session.role === "OWNER" checks depend on a role with exactly this name existing, so these can never be renamed/deleted (see Role.isSystem in schema.prisma).
export const SYSTEM_ROLE_NAMES = ["OWNER", "CO_OWNER", "MEMBER"] as const;

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
