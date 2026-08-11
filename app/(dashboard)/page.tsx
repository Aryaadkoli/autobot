import Link from "next/link";
import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";
import Mascot from "@/components/mascot";
import { STAGES } from "./contacts/stages";

export default async function OverviewPage() {
  const { tenantId, name } = await requireSession();

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [
    tenant,
    contacts,
    messages24h,
    activeSequences,
    stageCounts,
    topTags,
    businessTypeCount,
  ] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { name: true },
    }),
    prisma.contact.count({ where: { tenantId } }),
    prisma.message.count({ where: { tenantId, createdAt: { gte: since } } }),
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
  ]);

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

  const placeholderMetrics = [
    { label: "Delivery rate" },
    { label: "Reply rate" },
    { label: "Click rate" },
  ];

  const placeholderActivity = [
    "Message delivered to a lead",
    "Lead clicked a tracked link",
    "New lead imported",
    "Lead replied to a follow-up",
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
              <span className="text-[10px] uppercase tracking-wide text-stone-400 bg-stone-100 rounded-full px-2 py-0.5">
                Soon
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {placeholderMetrics.map((m) => (
                <div
                  key={m.label}
                  className="bg-white rounded-2xl border border-stone-200 p-3"
                >
                  <div className="text-xl font-semibold text-stone-300">—</div>
                  <div className="text-[11px] text-stone-500 mt-1 leading-tight">
                    {m.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-stone-700">
                Recent activity
              </h2>
              <span className="text-[10px] uppercase tracking-wide text-stone-400 bg-stone-100 rounded-full px-2 py-0.5">
                Soon
              </span>
            </div>
            <div className="bg-white rounded-2xl border border-stone-200 divide-y divide-stone-100">
              {placeholderActivity.map((item) => (
                <div
                  key={item}
                  className="px-4 py-2.5 text-sm text-stone-400 flex items-center gap-2.5"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-stone-200 shrink-0" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-stone-500">
            Messages, sequences and the activity feed will start filling in
            once the WhatsApp/email sending pipeline and workflow engine
            are built.
          </p>
        </div>
      </div>
    </div>
  );
}
