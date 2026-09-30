import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";
import { canEdit, isOwnerTier } from "@/lib/permissions";
import SettingsClient from "./settings-client";
import SendingLimits from "./sending-limits";
import RolesReference from "./roles-reference";

export default async function SettingsPage() {
  const session = await requireSession();

  // Sending limits and roles are owner/co-owner-only; the team list/hierarchy
  // is visible to everyone on the tenant (only edit actions stay gated).
  const ownerTier = isOwnerTier(session.role);
  const editTeam = canEdit(session.permissions, "TEAM");

  const [membershipRows, roleRows, tenant] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId: session.tenantId },
      select: { id: true, role: { select: { id: true, name: true } }, account: { select: { name: true, email: true } } },
      orderBy: { account: { name: "asc" } },
    }),
    prisma.role.findMany({
      where: { tenantId: session.tenantId },
      select: { id: true, name: true, isSystem: true, deletedAt: true, _count: { select: { users: true } } },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    }),
    prisma.tenant.findUniqueOrThrow({
      where: { id: session.tenantId },
      select: {
        timezone: true,
        sendingLimitsEnabled: true,
        dailyCapPerContact: true,
        quietHoursStart: true,
        quietHoursEnd: true,
      },
    }),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100 mb-6">
        Settings
      </h1>

      {/* Side by side on wide screens so nothing needs its own scroll —
          each section fills its grid cell instead of capping its own width. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {ownerTier && (
          <SendingLimits
            canEdit={ownerTier}
            timezone={tenant.timezone}
            sendingLimitsEnabled={tenant.sendingLimitsEnabled}
            dailyCapPerContact={tenant.dailyCapPerContact}
            quietHoursStart={tenant.quietHoursStart}
            quietHoursEnd={tenant.quietHoursEnd}
          />
        )}

        <div className={ownerTier ? "" : "lg:col-span-2"}>
          <SettingsClient
            canEdit={editTeam}
            users={membershipRows.map((u) => ({
              id: u.id,
              role: u.role.name,
              name: u.account.name,
              email: u.account.email,
            }))}
            assignableRoles={roleRows
              .filter((r) => r.name !== "OWNER" && !r.deletedAt)
              .map((r) => ({ id: r.id, name: r.name }))}
            currentUserId={session.userId}
            currentUserRole={session.role}
          />
        </div>

        {ownerTier && (
          <RolesReference
            canEdit={ownerTier}
            roles={roleRows.map((r) => ({
              id: r.id,
              name: r.name,
              isSystem: r.isSystem,
              deleted: Boolean(r.deletedAt),
              memberCount: r._count.users,
            }))}
          />
        )}
      </div>
    </div>
  );
}
