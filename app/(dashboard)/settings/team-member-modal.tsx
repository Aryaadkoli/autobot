"use client";

import { useState } from "react";
import Modal from "@/components/modal";
import { canRemoveTeamMember } from "@/lib/team-hierarchy";

type TeamUser = { id: string; name: string; email: string; role: string };
type AssignableRole = { id: string; name: string };

export default function TeamMemberModal({
  user,
  assignableRoles,
  currentUserId,
  currentUserRole,
  canEdit,
  onClose,
  onChanged,
}: {
  user: TeamUser;
  assignableRoles: AssignableRole[];
  currentUserId: string;
  currentUserRole: string;
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [roleId, setRoleId] = useState(
    assignableRoles.find((r) => r.name === user.role)?.id ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSelf = user.id === currentUserId;
  const canChangeRole =
    canEdit && !isSelf && canRemoveTeamMember(currentUserRole, user.role) && assignableRoles.length > 0;
  const canRemove = canEdit && !isSelf && canRemoveTeamMember(currentUserRole, user.role);

  async function handleRoleChange() {
    if (!roleId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not update role");
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update role");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!confirm(`Remove ${user.name} (${user.email})? They will lose access immediately.`)) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not remove teammate");
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove teammate");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Teammate" onClose={onClose}>
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-xl font-semibold text-stone-900">
            {user.name} {isSelf && <span className="text-sm text-stone-400 font-normal">(you)</span>}
          </h3>
          <p className="text-sm text-stone-500 mt-0.5">{user.email}</p>
        </div>
        <span className="text-[10px] uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
          {user.role}
        </span>
      </div>

      {error && (
        <p className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {canChangeRole && (
        <div className="mt-5">
          <label className="block text-sm text-stone-700 mb-1">Role</label>
          <div className="flex gap-2">
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              {assignableRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleRoleChange}
              disabled={saving || !roleId}
              className="rounded-lg bg-stone-900 text-white text-sm px-4 py-2 hover:bg-stone-800 disabled:opacity-50 cursor-pointer disabled:cursor-default"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {!canEdit && (
        <p className="mt-5 text-sm text-stone-500">
          You don&apos;t have permission to change roles or remove teammates.
        </p>
      )}
      {canEdit && isSelf && (
        <p className="mt-5 text-sm text-stone-500">
          You can&apos;t change your own role or remove yourself here.
        </p>
      )}
      {canEdit && !isSelf && !canRemoveTeamMember(currentUserRole, user.role) && (
        <p className="mt-5 text-sm text-stone-500">
          Only the owner can change an owner or co-owner&apos;s role or remove their account.
        </p>
      )}

      <div className="flex gap-3 mt-6">
        {canRemove && (
          <button
            onClick={handleRemove}
            disabled={saving}
            className="rounded-lg border border-red-200 text-red-600 text-sm px-4 py-2 hover:bg-red-50 cursor-pointer disabled:opacity-50"
          >
            {saving ? "Removing…" : "Remove from team"}
          </button>
        )}
        <button
          onClick={onClose}
          className="rounded-lg border border-stone-300 text-stone-700 text-sm px-4 py-2 hover:bg-stone-100 cursor-pointer"
        >
          Close
        </button>
      </div>
    </Modal>
  );
}
