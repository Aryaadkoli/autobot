import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";
import SettingsClient from "./settings-client";
import WhatsAppConnection from "./whatsapp-connection";
import SendingLimits from "./sending-limits";

export default async function SettingsPage() {
  const session = await requireSession();

  const [users, tenant] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId: session.tenantId },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    }),
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

  return (
    <div>
      <h1 className="text-2xl font-semibold text-stone-900 mb-6">Settings</h1>

      <WhatsAppConnection
        isOwner={session.role === "OWNER"}
        connected={Boolean(tenant.waPhoneNumberId && tenant.waAccessTokenEnc)}
        phoneNumberId={tenant.waPhoneNumberId}
        businessAcctId={tenant.waBusinessAcctId}
      />

      <div className="mt-8">
        <SendingLimits
          isOwner={session.role === "OWNER"}
          timezone={tenant.timezone}
          dailyCapPerContact={tenant.dailyCapPerContact}
          quietHoursStart={tenant.quietHoursStart}
          quietHoursEnd={tenant.quietHoursEnd}
        />
      </div>

      <div className="mt-10">
        <SettingsClient
          users={users}
          currentUserId={session.userId}
          isOwner={session.role === "OWNER"}
        />
      </div>
    </div>
  );
}
