import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";
import { canView, canEdit } from "@/lib/permissions";
import SettingsClient from "./settings-client";
import WhatsAppConnection from "./whatsapp-connection";
import SendingLimits from "./sending-limits";
import RolesReference from "./roles-reference";
import OrganizationsSection from "./organizations-section";

export default async function SettingsPage() {
  const session = await requireSession();

  const seeTeam = canView(session.permissions, "TEAM");
  const editTeam = canEdit(session.permissions, "TEAM");
  const seeSettings = canView(session.permissions, "SETTINGS");
  const editSettings = canEdit(session.permissions, "SETTINGS");

  const [membershipRows, roleRows, tenant] = await Promise.all([
    // Skip the query entirely for someone who won't be shown the team section.
    seeTeam
      ? prisma.user.findMany({
          where: { tenantId: session.tenantId },
          select: { id: true, role: { select: { id: true, name: true } }, account: { select: { name: true, email: true } } },
          orderBy: { account: { name: "asc" } },
        })
      : Promise.resolve([]),
    seeTeam
      ? prisma.role.findMany({
          where: { tenantId: session.tenantId },
          select: { id: true, name: true, isSystem: true, deletedAt: true, _count: { select: { users: true } } },
          orderBy: [{ isSystem: "desc" }, { name: "asc" }],
        })
      : Promise.resolve([]),
    prisma.tenant.findUniqueOrThrow({
      where: { id: session.tenantId },
      select: {
        waPhoneNumberId: true,
        waBusinessAcctId: true,
        waAccessTokenEnc: true,
        timezone: true,
        dailyCapPerContact: true,
        quietHoursStart: true,
        quietHoursEnd: true,
      },
    }),
  ]);

  // Organizations is always shown (open to everyone regardless of role
  // or module permission — see organizations-section.tsx), so this only
  // needs to flag when the *other* sections (WhatsApp/limits, Team) are
  // both hidden, not the whole page.
  const restOfPageHidden = !seeSettings && !seeTeam;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-stone-900 mb-6">Settings</h1>

      <div className="mb-8">
        <OrganizationsSection />
      </div>

      {restOfPageHidden && (
        <p className="text-sm text-stone-500 bg-white rounded-2xl border border-stone-200 p-6 max-w-2xl">
          You don&apos;t have access to WhatsApp connection, sending limits, or team settings. Ask the account owner if you need something changed here.
        </p>
      )}

      {seeSettings && (
        <>
          <WhatsAppConnection
            canEdit={editSettings}
            connected={Boolean(tenant.waPhoneNumberId && tenant.waAccessTokenEnc)}
            phoneNumberId={tenant.waPhoneNumberId}
            businessAcctId={tenant.waBusinessAcctId}
          />

          <div className="mt-8">
            <SendingLimits
              canEdit={editSettings}
              timezone={tenant.timezone}
              dailyCapPerContact={tenant.dailyCapPerContact}
              quietHoursStart={tenant.quietHoursStart}
              quietHoursEnd={tenant.quietHoursEnd}
            />
          </div>
        </>
      )}

      {seeTeam && (
        <div className="mt-10">
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
      )}

      {seeTeam && (
        <div className="mt-8">
          <RolesReference
            canEdit={editTeam}
            roles={roleRows.map((r) => ({
              id: r.id,
              name: r.name,
              isSystem: r.isSystem,
              deleted: Boolean(r.deletedAt),
              memberCount: r._count.users,
            }))}
          />
        </div>
      )}
    </div>
  );
}
