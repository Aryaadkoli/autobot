"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type RoleRow = { id: string; name: string; isSystem: boolean; deleted: boolean; memberCount: number };

const SYSTEM_ROLE_INFO: Record<string, string> = {
  OWNER: "Full control — the only role that can manage the team, connect WhatsApp, and change sending limits.",
  CO_OWNER: "Everything OWNER can do, except it can't remove an OWNER or another CO_OWNER's account.",
  MEMBER: "Whatever the owner has switched on for it below — starts out able to see (not edit) Leads, Templates, Campaigns, and Workflows.",
};

// One row per module, matching lib/permissions.ts's Module enum.
const MODULES: { key: string; label: string }[] = [
  { key: "LEADS", label: "Leads" },
  { key: "TEMPLATES", label: "Templates" },
  { key: "CAMPAIGNS", label: "Campaigns" },
  { key: "WORKFLOWS", label: "Workflows" },
  { key: "ANALYTICS", label: "Analytics" },
  { key: "TEAM", label: "Team & roles" },
  { key: "SETTINGS", label: "WhatsApp & sending settings" },
];

type PermState = Record<string, { canView: boolean; canEdit: boolean }>;

function emptyPermState(): PermState {
  return Object.fromEntries(MODULES.map((m) => [m.key, { canView: false, canEdit: false }]));
}

// Rendered whenever the signed-in role can see the TEAM module (see
// settings/page.tsx) — canEdit controls whether the add-role/delete
// controls and the "choose what a new role can view" form appear, or
// this is just a reference list.
export default function RolesReference({ roles, canEdit }: { roles: RoleRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [perms, setPerms] = useState<PermState>(emptyPermState());
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function togglePerm(moduleKey: string, field: "canView" | "canEdit") {
    setPerms((prev) => {
      const current = prev[moduleKey];
      const next = { ...current, [field]: !current[field] };
      // Editing implies viewing — doesn't make sense to grant edit
      // without also being able to see the module.
      if (field === "canEdit" && next.canEdit) next.canView = true;
      if (field === "canView" && !next.canView) next.canEdit = false;
      return { ...prev, [moduleKey]: next };
    });
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), permissions: perms }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not add role");
      setNewName("");
      setPerms(emptyPermState());
      setShowAdd(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add role");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(role: RoleRow) {
    const warning =
      role.memberCount > 0
        ? `${role.memberCount} teammate(s) currently have "${role.name}". It'll be hidden from future assignments but they'll keep it. Continue?`
        : `Delete the "${role.name}" role? No one has it, so this removes it for good.`;
    if (!confirm(warning)) return;
    setDeletingId(role.id);
    try {
      const res = await fetch(`/api/roles/${role.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not delete role");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not delete role");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-medium text-stone-700">Roles</h2>
        {canEdit && (
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="rounded-lg bg-stone-900 text-white text-xs px-3 py-1.5 hover:bg-stone-800 cursor-pointer"
          >
            + Add role
          </button>
        )}
      </div>
      <p className="text-sm text-stone-500 mb-4">
        What each role can do — check this before assigning one.
      </p>

      {showAdd && (
        <form onSubmit={handleAdd} className="mb-4 border border-stone-200 rounded-xl p-4 space-y-3">
          <div>
            <label className="block text-sm text-stone-700 mb-1">Role name</label>
            <input
              required
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. FIELD_AGENT"
              maxLength={50}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <p className="text-sm text-stone-700 mb-2">What can this role view / edit?</p>
            <div className="space-y-1.5">
              {MODULES.map((m) => (
                <div key={m.key} className="flex items-center justify-between text-sm">
                  <span className="text-stone-700">{m.label}</span>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-1.5 text-stone-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={perms[m.key].canView}
                        onChange={() => togglePerm(m.key, "canView")}
                      />
                      View
                    </label>
                    <label className="flex items-center gap-1.5 text-stone-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={perms[m.key].canEdit}
                        onChange={() => togglePerm(m.key, "canEdit")}
                      />
                      Edit
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-stone-900 text-white text-sm px-4 py-2 hover:bg-stone-800 disabled:opacity-50 cursor-pointer"
            >
              {saving ? "Adding…" : "Add role"}
            </button>
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="rounded-lg border border-stone-300 text-stone-700 text-sm px-4 py-2 hover:bg-stone-100 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {roles.map((r) => (
          <div key={r.id} className={`border rounded-xl p-4 ${r.deleted ? "border-stone-100 opacity-50" : "border-stone-100"}`}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                {r.name}
              </span>
              <div className="flex items-center gap-3">
                <span className="text-xs text-stone-400">
                  {r.memberCount} {r.memberCount === 1 ? "person" : "people"}
                </span>
                {canEdit && !r.isSystem && !r.deleted && (
                  <button
                    disabled={deletingId === r.id}
                    onClick={() => handleDelete(r)}
                    className="text-xs text-red-600 hover:underline cursor-pointer disabled:opacity-50"
                  >
                    {deletingId === r.id ? "Deleting…" : "Delete"}
                  </button>
                )}
                {r.deleted && <span className="text-xs text-stone-400">Deleted</span>}
              </div>
            </div>
            <p className="text-sm text-stone-700 mt-2">
              {SYSTEM_ROLE_INFO[r.name] ??
                "Custom role — access is whatever the owner chose for it when it was created."}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
