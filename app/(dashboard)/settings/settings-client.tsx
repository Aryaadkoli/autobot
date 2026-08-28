"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import UserModal from "./user-modal";

type TeamUser = { id: string; name: string; email: string; role: string };
type AssignableRole = { id: string; name: string };

// Only rendered for someone with view access to the TEAM module (see
// settings/page.tsx) — canEdit controls whether they can act on it or
// are just looking (e.g. a role with TEAM view but not edit).
export default function SettingsClient({
  users,
  assignableRoles,
  currentUserId,
  canEdit,
}: {
  users: TeamUser[];
  assignableRoles: AssignableRole[];
  currentUserId: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function refresh() {
    router.refresh();
  }

  async function handleDelete(user: TeamUser) {
    if (
      !confirm(`Remove ${user.name} (${user.email})? They will lose access immediately.`)
    )
      return;
    setDeletingId(user.id);
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not remove teammate");
      }
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not remove teammate");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 max-w-2xl">
        <h2 className="text-sm font-medium text-stone-700">Team members</h2>
        {canEdit && (
          <button
            onClick={() => setShowAdd(true)}
            className="rounded-lg bg-stone-900 text-white text-sm px-3 py-1.5 hover:bg-stone-800 cursor-pointer"
          >
            + Add teammate
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden max-w-2xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-stone-500 border-b border-stone-200">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-stone-100 last:border-0">
                <td className="px-4 py-3 text-stone-900">
                  {u.name}{" "}
                  {u.id === currentUserId && (
                    <span className="text-xs text-stone-400">(you)</span>
                  )}
                </td>
                <td className="px-4 py-3 text-stone-600">{u.email}</td>
                <td className="px-4 py-3">
                  <span className="text-[10px] uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {canEdit && u.id !== currentUserId && (
                    <button
                      disabled={deletingId === u.id}
                      onClick={() => handleDelete(u)}
                      className="text-xs text-red-600 hover:underline cursor-pointer disabled:opacity-50"
                    >
                      {deletingId === u.id ? "Removing…" : "Remove"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <UserModal
          assignableRoles={assignableRoles}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}
