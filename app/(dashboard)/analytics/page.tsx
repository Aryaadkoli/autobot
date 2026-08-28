import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";
import { canView } from "@/lib/permissions";
import NoModuleAccess from "../no-module-access";
import { outcomeLabelFromDefinition } from "@/core/workflow/outcome-label";
import AnalyticsClient from "./analytics-client";

// All queries below filter by tenantId (session.tenantId) — non-negotiable
// rule #1 in CLAUDE.md. This page is read-only: it aggregates the
// Message/Event/Campaign rows every other part of the app already writes,
// no new data collection needed.
export default async function AnalyticsPage() {
  const session = await requireSession();
  const { tenantId } = session;
  if (!canView(session.permissions, "ANALYTICS")) return <NoModuleAccess />;

  const [statusGroups, tenant, campaigns, trendRows, templateGroups, workflowsWithInstances, templateNames] =
    await Promise.all([
      prisma.message.groupBy({
        by: ["status"],
        where: { tenantId },
        _count: { _all: true },
        _sum: { costPaise: true },
      }),
      prisma.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { waPhoneNumberId: true, waAccessTokenEnc: true },
      }),
      prisma.campaign.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { template: { select: { name: true } } },
      }),
      prisma.$queryRaw<{ day: Date; count: bigint }[]>`
        SELECT date_trunc('day', "createdAt") AS day, count(*)::bigint AS count
        FROM "Message"
        WHERE "tenantId" = ${tenantId} AND "createdAt" >= NOW() - INTERVAL '14 days'
        GROUP BY day
        ORDER BY day ASC
      `,
      prisma.message.groupBy({
        by: ["templateId", "status"],
        where: { tenantId, templateId: { not: null } },
        _count: { _all: true },
      }),
      prisma.workflow.findMany({
        where: { tenantId },
        select: {
          id: true,
          name: true,
          definition: true,
          instances: { select: { status: true, currentStepId: true } },
        },
      }),
      prisma.messageTemplate.findMany({ where: { tenantId }, select: { id: true, name: true } }),
    ]);
  const templateNameById = Object.fromEntries(templateNames.map((t) => [t.id, t.name]));

  const counts = Object.fromEntries(
    statusGroups.map((g) => [g.status, g._count._all])
  ) as Record<string, number>;
  const totalCostPaise = statusGroups.reduce(
    (sum, g) => sum + (g._sum.costPaise ?? 0),
    0
  );

  const sent = counts.SENT ?? 0;
  const delivered = counts.DELIVERED ?? 0;
  const read = counts.READ ?? 0;
  const failed = counts.FAILED ?? 0;
  const suppressed = counts.SUPPRESSED ?? 0;
  const totalAttempts = sent + delivered + read + failed;
  const confirmedDelivered = delivered + read;

  // Fill in the last 14 days so the trend chart has no gaps, even on days
  // with zero sends.
  const trendMap = new Map(
    trendRows.map((r) => [r.day.toISOString().slice(0, 10), Number(r.count)])
  );
  const trend: { date: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    trend.push({ date: key, count: trendMap.get(key) ?? 0 });
  }

  const isLiveConnected = Boolean(tenant.waPhoneNumberId && tenant.waAccessTokenEnc);

  // Top templates by volume — same status buckets as the headline cards,
  // just grouped per template instead of tenant-wide.
  const perTemplate = new Map<string, { sent: number; delivered: number; failed: number }>();
  for (const g of templateGroups) {
    if (!g.templateId) continue;
    const row = perTemplate.get(g.templateId) ?? { sent: 0, delivered: 0, failed: 0 };
    const n = g._count._all;
    if (g.status === "SENT") row.sent += n;
    else if (g.status === "DELIVERED" || g.status === "READ") {
      row.sent += n;
      row.delivered += n;
    } else if (g.status === "FAILED") {
      row.sent += n;
      row.failed += n;
    }
    perTemplate.set(g.templateId, row);
  }
  const topTemplates = Array.from(perTemplate.entries())
    .map(([templateId, stats]) => ({
      name: templateNameById[templateId] ?? "(deleted template)",
      ...stats,
    }))
    .sort((a, b) => b.sent - a.sent)
    .slice(0, 5);

  // Workflow outcomes — walks each workflow's finished instances back to
  // the "end" step definition to get a human label.
  const workflowOutcomes = workflowsWithInstances
    .filter((w) => w.instances.length > 0)
    .map((w) => {
      const active = w.instances.filter((i) => i.status === "ACTIVE").length;
      const outcomeCounts = new Map<string, number>();
      let otherEnded = 0;
      for (const inst of w.instances) {
        if (inst.status === "COMPLETED") {
          const label = outcomeLabelFromDefinition(w.definition, inst.currentStepId);
          outcomeCounts.set(label, (outcomeCounts.get(label) ?? 0) + 1);
        } else if (inst.status !== "ACTIVE") {
          otherEnded++; // pivoted / cancelled / suppressed
        }
      }
      return {
        id: w.id,
        name: w.name,
        total: w.instances.length,
        active,
        otherEnded,
        outcomes: Array.from(outcomeCounts.entries()).map(([label, count]) => ({ label, count })),
      };
    });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-stone-900 mb-2">Analytics</h1>
      <p className="text-sm text-stone-500 mb-6 max-w-xl">
        How your messages are actually landing — delivery, reads, and spend,
        built from the same Messages and Events every send already writes.
      </p>
      <AnalyticsClient
        totalAttempts={totalAttempts}
        sent={sent}
        confirmedDelivered={confirmedDelivered}
        read={read}
        failed={failed}
        suppressed={suppressed}
        totalCostPaise={totalCostPaise}
        isLiveConnected={isLiveConnected}
        trend={trend}
        campaigns={campaigns.map((c) => ({
          id: c.id,
          templateName: c.template?.name ?? "(deleted template)",
          source: c.source,
          targetedCount: c.targetedCount,
          sentCount: c.sentCount,
          failedCount: c.failedCount,
          skippedCount: c.skippedCount,
          createdAt: c.createdAt.toISOString(),
        }))}
        topTemplates={topTemplates}
        workflowOutcomes={workflowOutcomes}
      />
    </div>
  );
}
