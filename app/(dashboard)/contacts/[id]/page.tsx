import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/auth";
import { prisma } from "@/lib/db";
import { canView } from "@/lib/permissions";
import NoModuleAccess from "../../no-module-access";
import { outcomeLabelFromDefinition } from "@/core/workflow/outcome-label";
import StageBadge from "../stage-badge";
import { formatAttributeLabel, visibleAttributes } from "../attributes";
import { eventLabel, eventDotClass } from "../event-meta";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { tenantId } = session;
  if (!canView(session.permissions, "LEADS")) return <NoModuleAccess />;
  const { id } = await params;

  const contact = await prisma.contact.findFirst({
    where: { id, tenantId },
    include: { businessType: true, tags: { include: { tag: true } } },
  });

  if (!contact) notFound();

  const [events, instances] = await Promise.all([
    prisma.event.findMany({
      where: { tenantId, contactId: contact.id },
      orderBy: { occurredAt: "desc" },
      take: 50,
    }),
    prisma.sequenceInstance.findMany({
      where: { tenantId, contactId: contact.id },
      orderBy: { startedAt: "desc" },
      take: 5,
      include: { workflow: { select: { name: true, definition: true } } },
    }),
  ]);

  const INSTANCE_STATUS_STYLE: Record<string, string> = {
    ACTIVE: "bg-amber-50 text-amber-700 border-amber-200",
    COMPLETED: "bg-green-50 text-green-700 border-green-200",
    PIVOTED: "bg-blue-50 text-blue-700 border-blue-200",
    CANCELLED: "bg-stone-50 text-stone-500 border-stone-200",
    SUPPRESSED: "bg-red-50 text-red-700 border-red-200",
  };

  const attrs = contact.attributes as { stage?: string } | null;
  const details = visibleAttributes(contact.attributes);

  return (
    <div>
      <Link
        href="/contacts"
        className="text-sm text-stone-500 hover:text-stone-800"
      >
        ← Back to Leads
      </Link>

      <div className="mt-4 bg-white rounded-2xl border border-stone-200 p-6 max-w-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-stone-900">
              {contact.name ?? "—"}
            </h1>
            <p className="text-sm text-stone-500 mt-0.5">{contact.phone}</p>
          </div>
          <StageBadge stage={attrs?.stage ?? "new"} />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-stone-500">Business type</div>
            <div className="text-stone-900 mt-0.5">
              {contact.businessType?.name ?? "—"}
            </div>
          </div>
          {details.map(([key, value]) => (
            <div key={key}>
              <div className="text-stone-500">{formatAttributeLabel(key)}</div>
              <div className="text-stone-900 mt-0.5">{String(value)}</div>
            </div>
          ))}
        </div>

        {contact.tags.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-1">
            {contact.tags.map((t) => (
              <span
                key={t.tagId}
                className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 text-xs border border-amber-200"
              >
                {t.tag.name}
              </span>
            ))}
          </div>
        )}

        {instances.length > 0 && (
          <div className="mt-5 pt-5 border-t border-stone-100">
            <div className="text-xs text-stone-500 mb-2">Workflows</div>
            <div className="space-y-1.5">
              {instances.map((inst) => (
                <div key={inst.id} className="flex items-center justify-between text-sm">
                  <Link href="/workflows" className="text-stone-700 hover:text-stone-900">
                    {inst.workflow.name}
                  </Link>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs border ${
                      INSTANCE_STATUS_STYLE[inst.status] ?? ""
                    }`}
                  >
                    {inst.status === "COMPLETED"
                      ? outcomeLabelFromDefinition(inst.workflow.definition, inst.currentStepId)
                      : inst.status === "ACTIVE"
                        ? "In progress"
                        : inst.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <h2 className="text-lg font-medium text-stone-900 mt-8 mb-4">Activity</h2>

      {events.length === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center max-w-2xl">
          <p className="text-sm text-stone-500">
            No activity yet. Once imports and workflows are running, every
            message and reply will show up here.
          </p>
        </div>
      ) : (
        <ol className="max-w-2xl space-y-0">
          {events.map((e, i) => (
            <li key={e.id} className="relative pl-6 pb-5 last:pb-0">
              {i !== events.length - 1 && (
                <span className="absolute left-[5px] top-3 bottom-0 w-px bg-stone-200" />
              )}
              <span
                className={`absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full ${eventDotClass(
                  e.type
                )}`}
              />
              <div className="text-sm text-stone-900">{eventLabel(e.type)}</div>
              <div className="text-xs text-stone-500 mt-0.5">
                {e.occurredAt.toLocaleString("en-IN", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
