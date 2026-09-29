"use client";

import { useState } from "react";
import Modal from "@/components/modal";

type CustomerStatus = { id: string; name: string };
type LeadStageOption = { id: string; name: string; customerStatusId: string };

export default function TaxonomyManagerModal({
  customerStatuses,
  leadStages,
  onClose,
  onChanged,
}: {
  customerStatuses: CustomerStatus[];
  leadStages: LeadStageOption[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newStatusName, setNewStatusName] = useState("");
  const [newStageName, setNewStageName] = useState<Record<string, string>>({});
  const [renaming, setRenaming] = useState<{ kind: "status" | "stage"; id: string; value: string } | null>(null);

  async function run(fn: () => Promise<Response>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function addStatus() {
    const name = newStatusName.trim();
    if (!name) return;
    await run(() =>
      fetch("/api/customer-statuses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
    );
    setNewStatusName("");
  }

  async function addStage(customerStatusId: string) {
    const name = (newStageName[customerStatusId] ?? "").trim();
    if (!name) return;
    await run(() =>
      fetch("/api/lead-stages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerStatusId, name }),
      })
    );
    setNewStageName((s) => ({ ...s, [customerStatusId]: "" }));
  }

  async function saveRename() {
    if (!renaming) return;
    const { kind, id, value } = renaming;
    const name = value.trim();
    if (!name) {
      setRenaming(null);
      return;
    }
    const url = kind === "status" ? `/api/customer-statuses/${id}` : `/api/lead-stages/${id}`;
    await run(() =>
      fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
    );
    setRenaming(null);
  }

  async function deleteStatus(id: string, name: string) {
    if (!confirm(`Delete "${name}" and all its stages? This can't be undone — blocked if any lead is currently set to it.`)) {
      return;
    }
    await run(() => fetch(`/api/customer-statuses/${id}`, { method: "DELETE" }));
  }

  async function deleteStage(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This can't be undone — blocked if any lead is currently set to it.`)) {
      return;
    }
    await run(() => fetch(`/api/lead-stages/${id}`, { method: "DELETE" }));
  }

  return (
    <Modal title="Manage customer statuses & lead stages" onClose={onClose} wide>
      <p className="text-sm text-stone-500 mb-4">
        Each status is a track (e.g. Acquisition, Retention) made up of ordered stages. Only
        owners and co-owners can change this. A status or stage can&apos;t be removed while any
        lead is still set to it — reassign those leads first.
      </p>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
          {error}
        </p>
      )}

      <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
        {customerStatuses.map((status) => {
          const stages = leadStages.filter((s) => s.customerStatusId === status.id);
          const isRenamingStatus = renaming?.kind === "status" && renaming.id === status.id;
          return (
            <div key={status.id} className="border border-stone-200 rounded-xl p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                {isRenamingStatus ? (
                  <input
                    autoFocus
                    value={renaming.value}
                    onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && saveRename()}
                    onBlur={saveRename}
                    className="flex-1 rounded-lg border border-amber-400 px-2 py-1 text-sm font-medium focus:outline-none"
                  />
                ) : (
                  <h3 className="text-sm font-medium text-stone-900">{status.name}</h3>
                )}
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    disabled={busy}
                    onClick={() => setRenaming({ kind: "status", id: status.id, value: status.name })}
                    className="text-xs text-stone-500 hover:text-stone-800 cursor-pointer"
                  >
                    Rename
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => deleteStatus(status.id, status.name)}
                    className="text-xs text-red-600 hover:underline cursor-pointer"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                {stages.map((stage) => {
                  const isRenamingStage = renaming?.kind === "stage" && renaming.id === stage.id;
                  return (
                    <div
                      key={stage.id}
                      className="flex items-center justify-between gap-2 pl-3 py-1 border-l-2 border-stone-200"
                    >
                      {isRenamingStage ? (
                        <input
                          autoFocus
                          value={renaming.value}
                          onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
                          onKeyDown={(e) => e.key === "Enter" && saveRename()}
                          onBlur={saveRename}
                          className="flex-1 rounded-lg border border-amber-400 px-2 py-1 text-sm focus:outline-none"
                        />
                      ) : (
                        <span className="text-sm text-stone-700">{stage.name}</span>
                      )}
                      <div className="flex items-center gap-3 shrink-0">
                        <button
                          disabled={busy}
                          onClick={() => setRenaming({ kind: "stage", id: stage.id, value: stage.name })}
                          className="text-xs text-stone-500 hover:text-stone-800 cursor-pointer"
                        >
                          Rename
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => deleteStage(stage.id, stage.name)}
                          className="text-xs text-red-600 hover:underline cursor-pointer"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}

                <div className="flex items-center gap-2 pl-3 pt-1">
                  <input
                    value={newStageName[status.id] ?? ""}
                    onChange={(e) => setNewStageName((s) => ({ ...s, [status.id]: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && addStage(status.id)}
                    placeholder="New stage name"
                    className="flex-1 rounded-lg border border-stone-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <button
                    disabled={busy || !(newStageName[status.id] ?? "").trim()}
                    onClick={() => addStage(status.id)}
                    className="text-xs text-stone-700 hover:text-stone-900 border border-stone-300 rounded-lg px-2 py-1 cursor-pointer disabled:opacity-50"
                  >
                    + Add stage
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 mt-4 pt-4 border-t border-stone-200">
        <input
          value={newStatusName}
          onChange={(e) => setNewStatusName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addStatus()}
          placeholder="New customer status name"
          className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
        <button
          disabled={busy || !newStatusName.trim()}
          onClick={addStatus}
          className="rounded-lg bg-stone-900 text-white text-sm px-3 py-2 hover:bg-stone-800 cursor-pointer disabled:opacity-50"
        >
          + Add status
        </button>
      </div>

      <div className="flex justify-end mt-5">
        <button
          onClick={onClose}
          className="rounded-lg border border-stone-300 text-stone-700 text-sm px-4 py-2 hover:bg-stone-100 cursor-pointer"
        >
          Done
        </button>
      </div>
    </Modal>
  );
}
