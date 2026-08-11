import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";
import WorkflowsClient from "./workflows-client";

// Phase 4 — the real workflow engine (core/workflow/engine.ts): multi-step
// sequences with wait/branch/pivot, backed by BullMQ (core/workflow/queues.ts)
// and a worker (worker/index.ts, also started in-process for dev — see
// instrumentation.ts). Authored via a plain-language step builder
// (simple-builder.ts) — no JSON required for the common case; an
// "Advanced" JSON mode is still there as an escape hatch for anything the
// guided builder can't express.
export default async function WorkflowsPage() {
  const { tenantId } = await requireSession();

  const [workflows, services, tags, templates] = await Promise.all([
    prisma.workflow.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      include: {
        service: { select: { name: true, priority: true } },
        _count: { select: { instances: true } },
      },
    }),
    prisma.service.findMany({ where: { tenantId }, orderBy: { priority: "asc" } }),
    prisma.tag.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
    prisma.messageTemplate.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      select: { name: true, channel: true },
    }),
  ]);

  // Active-instance counts separately — Prisma's _count can't filter by a
  // relation's field in the same query as an unfiltered count.
  const activeCounts = await prisma.sequenceInstance.groupBy({
    by: ["workflowId"],
    where: { tenantId, status: "ACTIVE" },
    _count: { _all: true },
  });
  const activeByWorkflow = Object.fromEntries(
    activeCounts.map((a) => [a.workflowId, a._count._all])
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold text-stone-900 mb-2">Workflows</h1>
      <p className="text-sm text-stone-500 mb-6 max-w-2xl">
        Multi-step follow-up plans that react to what a lead does — reply,
        click, or stay silent — not just a calendar date. For the
        date-driven case (&ldquo;send X every January&rdquo;), Campaigns
        already covers that; Workflows is for sequences that branch.
      </p>
      <WorkflowsClient
        workflows={workflows.map((w) => ({
          id: w.id,
          name: w.name,
          status: w.status,
          serviceName: w.service.name,
          servicePriority: w.service.priority,
          definition: w.definition,
          totalInstances: w._count.instances,
          activeInstances: activeByWorkflow[w.id] ?? 0,
        }))}
        services={services.map((s) => ({ id: s.id, name: s.name, priority: s.priority }))}
        tags={tags.map((t) => ({ id: t.id, name: t.name }))}
        templates={templates.map((t) => ({ name: t.name, channel: t.channel }))}
      />
    </div>
  );
}
