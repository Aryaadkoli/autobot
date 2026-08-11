import Link from "next/link";
import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";
import Mascot from "@/components/mascot";
import { STAGES } from "./contacts/stages";
import { eventLabel, eventDotClass } from "./contacts/event-meta";
import { hoursAgo } from "@/lib/dates";

export default async function OverviewPage() {
  const { tenantId, name } = await requireSession();

  const since24h = hoursAgo(24);
  const since7d = hoursAgo(7 * 24);
  const [
    tenant,
    contacts,
    messages24h,
    activeSequences,
    stageCounts,
    topTags,
    businessTypeCount,
    weekMessageStatusGroups,
    weekEventCounts,
    recentEvents,
  ] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { name: true },
    }),
    prisma.contact.count({ where: { tenantId } }),
    prisma.message.count({ where: { tenantId, createdAt: { gte: since24h } } }),
    prisma.sequenceInstance.count({ where: { tenantId, status: "ACTIVE" } }),
    Promise.all(
      STAGES.map((s) =>
        prisma.contact.count({
          where: { tenantId, attributes: { path: ["stage"], equals: s.value } },
        })
      )
    ),
    prisma.tag.findMany({
      where: { tenantId },
      include: { _count: { select: { contacts: true } } },
      orderBy: { contacts: { _count: "desc" } },
      take: 5,
    }),
    prisma.businessType.count({ where: { tenantId } }),
    prisma.message.groupBy({
      by: ["status"],
      where: { tenantId, createdAt: { gte: since7d } },
      _count: { _all: true },
    }),
    prisma.event.groupBy({
      by: ["type"],
      where: { tenantId, occurredAt: { gte: since7d }, type: { in: ["REPLIED", "LINK_CLICKED"] } },
      _count: { _all: true },
    }),
    prisma.event.findMany({
      where: { tenantId },
      orderBy: { occurredAt: "desc" },
      take: 8,
      include: { contact: { select: { name: true, phone: true } } },
    }),
  ]);

  const weekCounts = Object.fromEntries(
    weekMessageStatusGroups.map((g) => [g.status, g._count._all])
  ) as Record<string, number>;
  const weekSentTotal =
    (weekCounts.SENT ?? 0) + (weekCounts.DELIVERED ?? 0) + (weekCounts.READ ?? 0) + (weekCounts.FAILED ?? 0);
  const weekDelivered = (weekCounts.DELIVERED ?? 0) + (weekCounts.READ ?? 0);
  const weekEvents = Object.fromEntries(
    weekEventCounts.map((g) => [g.type, g._count._all])
  ) as Record<string, number>;

  function pct(n: number, d: number) {
    return d === 0 ? "—" : `${Math.round((n / d) * 100)}%`;
  }

  const weekMetrics = [
    { label: "Delivery rate", value: pct(weekDelivered, weekSentTotal) },
    { label: "Reply rate", value: pct(weekEvents.REPLIED ?? 0, weekSentTotal) },
    { label: "Click rate", value: pct(weekEvents.LINK_CLICKED ?? 0, weekSentTotal) },
  ];

  const stats = [
    { label: "Leads", value: contacts },
    { label: "Messages, last 24h", value: messages24h },
    { label: "Active sequences", value: activeSequences },
  ];

  const quickActions = [
    { href: "/contacts?new=1", label: "Add a lead" },
    { href: "/contacts?import=1", label: "Import leads" },
    { href: "/contacts", label: "View all leads" },
  ];

  const stageBreakdown = STAGES.map((s, i) => ({
    ...s,
    count: stageCounts[i],
  }));
  const maxStageCount = Math.max(1, ...stageBreakdown.map((s) => s.count));
  const usedTags = topTags.filter((t) => t._count.contacts > 0);

  return (
    <div className="h-full flex flex-col">
      <div className="relative mb-6 overflow-hidden rounded-2xl bg-stone-900 px-8 py-7 shrink-0">
        <div
          className="pointer-events-none absolute inset-0 [animation:glow-breathe_6s_ease-in-out_infinite]"
          style={{
            background:
              "radial-gradient(circle at 85% 20%, rgba(251,191,36,0.16), transparent 55%)",
          }}
        />
        <div className="pointer-events-none absolute -right-2 -top-6 opacity-90 scale-[0.8] origin-top-right">
          <Mascot />
        </div>
        <div className="relative max-w-[60%]">
          <h2 className="text-xl font-medium text-white">
            Welcome back, {name || "there"}
          </h2>
          <p className="mt-1.5 text-sm text-stone-400">
            Here&apos;s what&apos;s happening at {tenant.name} today.
          </p>
        </div>
      </div>

      <h1 className="text-2xl font-semibold text-stone-900 mb-5 shrink-0">
        Overview
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        <div className="lg:col-span-2 space-y-6 min-w-0">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {stats.map((s) => (
              <div
                key={s.label}
                className="bg-white rounded-2xl border border-stone-200 p-5"
              >
                <div className="text-3xl font-semibold text-stone-900">
                  {s.value}
                </div>
                <div className="text-sm text-stone-500 mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            {quickActions.map((a) => (
              <Link
                key={a.label}
                href={a.href}
                className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm text-stone-700 hover:bg-stone-100"
              >
                {a.label}
              </Link>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <h2 className="text-sm font-medium text-stone-700 mb-3">
                Leads by stage
              </h2>
              <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-3">
                {contacts === 0 ? (
                  <p className="text-sm text-stone-500">
                    No leads yet — add or import your first ones.
                  </p>
                ) : (
                  stageBreakdown.map((s) => (
                    <Link
                      key={s.value}
                      href={`/contacts?stage=${s.value}`}
                      className="block group"
                    >
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-stone-600 group-hover:text-stone-900">
                          {s.label}
                        </span>
                        <span className="text-stone-500">{s.count}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-stone-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-amber-500/80 group-hover:bg-amber-500"
                          style={{
                            width: `${(s.count / maxStageCount) * 100}%`,
                          }}
                        />
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>

            <div>
              <h2 className="text-sm font-medium text-stone-700 mb-3">
                Top tags
              </h2>
              <div className="bg-white rounded-2xl border border-stone-200 p-5">
                {usedTags.length === 0 ? (
                  <p className="text-sm text-stone-500">
                    No tags in use yet. Manage tags from the Leads page.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {usedTags.map((t) => (
                      <span
                        key={t.id}
                        className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 text-xs border border-amber-200"
                      >
                        {t.name} · {t._count.contacts}
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-xs text-stone-400 mt-4">
                  {businessTypeCount} business type
                  {businessTypeCount === 1 ? "" : "s"} in use across your
                  leads.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6 min-w-0">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-stone-700">
                This week
              </h2>
              <Link
                href="/analytics"
                className="text-[11px] text-amber-700 hover:underline"
              >
                Full analytics →
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {weekMetrics.map((m) => (
                <div
                  key={m.label}
                  className="bg-white rounded-2xl border border-stone-200 p-3"
                >
                  <div className="text-xl font-semibold text-stone-900">{m.value}</div>
                  <div className="text-[11px] text-stone-500 mt-1 leading-tight">
                    {m.label}
                  </div>
                </div>
              ))}
            </div>
            {weekSentTotal === 0 && (
              <p className="text-xs text-stone-400 mt-2">
                No sends in the last 7 days yet.
              </p>
            )}
          </div>

          <div>
            <h2 className="text-sm font-medium text-stone-700 mb-3">
              Recent activity
            </h2>
            {recentEvents.length === 0 ? (
              <div className="bg-white rounded-2xl border border-stone-200 px-4 py-6 text-center">
                <p className="text-sm text-stone-500">Nothing yet — activity shows up here as leads come in.</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-stone-200 divide-y divide-stone-100">
                {recentEvents.map((e) => (
                  <div
                    key={e.id}
                    className="px-4 py-2.5 text-sm text-stone-700 flex items-center gap-2.5"
                  >
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${eventDotClass(e.type)}`} />
                    <span className="truncate">
                      {eventLabel(e.type)}
                      <span className="text-stone-400">
                        {" "}
                        — {e.contact.name || e.contact.phone}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
