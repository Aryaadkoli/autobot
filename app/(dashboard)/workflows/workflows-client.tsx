"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import WorkflowModal, { type EditableWorkflow } from "./workflow-modal";
import EnrollModal from "./enroll-modal";

type Workflow = {
  id: string;
  name: string;
  status: string;
  serviceName: string;
  servicePriority: number;
  definition: unknown;
  totalInstances: number;
  activeInstances: number;
};

type ModalState =
  | { type: "create" }
  | { type: "edit"; workflow: Workflow }
  | { type: "enroll"; workflow: Workflow }
  | null;

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-stone-100 text-stone-600 border-stone-200",
  ACTIVE: "bg-green-50 text-green-700 border-green-200",
  ARCHIVED: "bg-stone-50 text-stone-400 border-stone-200",
};

export default function WorkflowsClient({
  workflows,
  services,
  tags,
  templates,
}: {
  workflows: Workflow[];
  services: { id: string; name: string; priority: number }[];
  tags: { id: string; name: string }[];
  templates: { name: string; channel: string }[];
}) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalState>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showExample, setShowExample] = useState(false);

  function refresh() {
    router.refresh();
  }
  function closeAndRefresh() {
    setModal(null);
    refresh();
  }

  async function setStatus(workflow: Workflow, status: "ACTIVE" | "ARCHIVED" | "DRAFT") {
    setBusyId(workflow.id);
    try {
      const res = await fetch(`/api/workflows/${workflow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not update status");
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not update status");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(workflow: Workflow) {
    if (!confirm(`Delete "${workflow.name}"? This can't be undone.`)) return;
    setBusyId(workflow.id);
    try {
      const res = await fetch(`/api/workflows/${workflow.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not delete workflow");
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not delete workflow");
    } finally {
      setBusyId(null);
    }
  }

  function toEditable(w: Workflow): EditableWorkflow {
    return { id: w.id, name: w.name, definition: w.definition };
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setShowExample((s) => !s)}
          className="text-xs text-amber-700 hover:underline cursor-pointer"
        >
          {showExample ? "Hide" : "Show"} an example (mango-farmer style)
        </button>
        <button
          onClick={() => setModal({ type: "create" })}
          disabled={services.length === 0}
          className="rounded-lg bg-stone-900 text-white text-sm px-3 py-1.5 hover:bg-stone-800 cursor-pointer disabled:opacity-50 disabled:cursor-default"
        >
          + New workflow
        </button>
      </div>

      {showExample && (
        <div className="bg-stone-50 rounded-2xl border border-stone-200 p-5 mb-6 max-w-2xl">
          <p className="text-sm text-stone-600 mb-3">
            A workflow reacts to what a lead does, not just a calendar date:
          </p>
          <ol className="space-y-2 text-sm text-stone-700 list-decimal list-inside">
            <li>Send &quot;mango season is here&quot; to everyone tagged mango-farmer</li>
            <li>Wait up to 48 hours, watching for a reply or a link click</li>
            <li>Replied? Jump straight to &quot;ready to order&quot;. Clicked the link? Pivot to a sales sub-flow. Neither? Send a gentle reminder.</li>
          </ol>
          <p className="text-xs text-stone-400 mt-3">
            The same shape works for the electricity/smart-meters business —
            same machinery, different messages and triggers. For a plain
            date-driven send with no branching, Campaigns is simpler.
          </p>
        </div>
      )}

      {workflows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-10 text-center max-w-2xl">
          <p className="text-stone-700 font-medium">No workflows yet</p>
          <p className="text-sm text-stone-500 mt-1">
            Create one to start a sequence that reacts to replies and clicks.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-stone-500 border-b border-stone-200">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Service</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Leads running</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {workflows.map((w) => (
                <tr key={w.id} className="border-b border-stone-100 last:border-0">
                  <td className="px-4 py-3 text-stone-900">{w.name}</td>
                  <td className="px-4 py-3 text-stone-600">
                    {w.serviceName}
                    <span className="text-stone-400"> (priority {w.servicePriority})</span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs border ${STATUS_STYLE[w.status] ?? ""}`}
                    >
                      {w.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-stone-600">
                    {w.activeInstances} active
                    {w.totalInstances > w.activeInstances && (
                      <span className="text-stone-400">
                        {" "}
                        · {w.totalInstances - w.activeInstances} finished
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      {w.status === "ACTIVE" && (
                        <button
                          onClick={() => setModal({ type: "enroll", workflow: w })}
                          className="text-xs text-amber-700 hover:underline cursor-pointer"
                        >
                          Enroll leads
                        </button>
                      )}
                      {w.status === "DRAFT" && (
                        <button
                          disabled={busyId === w.id}
                          onClick={() => setStatus(w, "ACTIVE")}
                          className="text-xs text-green-700 hover:underline cursor-pointer disabled:opacity-50"
                        >
                          Activate
                        </button>
                      )}
                      {w.status === "ACTIVE" && (
                        <button
                          disabled={busyId === w.id}
                          onClick={() => setStatus(w, "ARCHIVED")}
                          className="text-xs text-stone-500 hover:text-stone-800 cursor-pointer disabled:opacity-50"
                        >
                          Archive
                        </button>
                      )}
                      <button
                        onClick={() => setModal({ type: "edit", workflow: w })}
                        disabled={w.activeInstances > 0}
                        title={
                          w.activeInstances > 0
                            ? "Can't edit steps while leads are actively running this workflow"
                            : undefined
                        }
                        className="text-xs text-stone-500 hover:text-stone-800 cursor-pointer disabled:opacity-40 disabled:cursor-default"
                      >
                        Edit
                      </button>
                      <button
                        disabled={busyId === w.id}
                        onClick={() => handleDelete(w)}
                        className="text-xs text-red-600 hover:underline cursor-pointer disabled:opacity-50"
                      >
                        {busyId === w.id ? "…" : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal?.type === "create" && (
        <WorkflowModal
          services={services}
          templates={templates}
          otherWorkflowNames={workflows.filter((w) => w.status === "ACTIVE").map((w) => w.name)}
          onClose={() => setModal(null)}
          onSaved={closeAndRefresh}
        />
      )}
      {modal?.type === "edit" && (
        <WorkflowModal
          workflow={toEditable(modal.workflow)}
          services={services}
          templates={templates}
          otherWorkflowNames={workflows
            .filter((w) => w.status === "ACTIVE" && w.id !== modal.workflow.id)
            .map((w) => w.name)}
          onClose={() => setModal(null)}
          onSaved={closeAndRefresh}
        />
      )}
      {modal?.type === "enroll" && (
        <EnrollModal
          workflowId={modal.workflow.id}
          workflowName={modal.workflow.name}
          tags={tags}
          onClose={() => setModal(null)}
          onEnrolled={refresh}
        />
      )}
    </div>
  );
}
