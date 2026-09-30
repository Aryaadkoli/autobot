"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import UserModal from "./user-modal";
import TeamMemberModal from "./team-member-modal";

type TeamUser = { id: string; name: string; email: string; role: string };
type AssignableRole = { id: string; name: string };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function UserNode({
  user,
  isSelf,
  onClick,
}: {
  user: TeamUser;
  isSelf: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2 text-left hover:bg-stone-50 cursor-pointer"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-900 text-white text-xs font-medium">
        {initials(user.name) || "?"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-stone-900 truncate">
          {user.name} {isSelf && <span className="text-xs text-stone-400">(you)</span>}
        </span>
        <span className="block text-xs text-stone-500 truncate">{user.email}</span>
      </span>
    </button>
  );
}

// A tier group indented under its parent, connected by a vertical rule — the
// visual shape of the hierarchy (OWNER > CO_OWNER > everyone else, per
// lib/team-hierarchy.ts's canRemoveTeamMember, the one ranking that actually
// exists today) rather than a flat table.
function TierGroup({
  label,
  users,
  currentUserId,
  onSelect,
  indent,
}: {
  label: string;
  users: TeamUser[];
  currentUserId: string;
  onSelect: (u: TeamUser) => void;
  indent: number;
}) {
  if (users.length === 0) return null;
  return (
    <div style={{ marginLeft: indent }} className={indent > 0 ? "border-l-2 border-stone-100 pl-4" : ""}>
      <div className="text-xs font-medium uppercase tracking-wide text-stone-400 mb-2">
        {label}
      </div>
      <div className="space-y-2 mb-4">
        {users.map((u) => (
          <UserNode key={u.id} user={u} isSelf={u.id === currentUserId} onClick={() => onSelect(u)} />
        ))}
      </div>
    </div>
  );
}

// canEdit controls whether they can act on it or are just looking (e.g. TEAM view but not edit).
export default function SettingsClient({
  users,
  assignableRoles,
  currentUserId,
  currentUserRole,
  canEdit,
}: {
  users: TeamUser[];
  assignableRoles: AssignableRole[];
  currentUserId: string;
  currentUserRole: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState<TeamUser | null>(null);

  function refresh() {
    router.refresh();
  }

  const owners = users.filter((u) => u.role === "OWNER");
  const coOwners = users.filter((u) => u.role === "CO_OWNER");
  const rest = users.filter((u) => u.role !== "OWNER" && u.role !== "CO_OWNER");

  const restByRole = new Map<string, TeamUser[]>();
  for (const u of rest) {
    const list = restByRole.get(u.role) ?? [];
    list.push(u);
    restByRole.set(u.role, list);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
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

      <div className="bg-white rounded-2xl border border-stone-200 p-4">
        <TierGroup label="Owner" users={owners} currentUserId={currentUserId} onSelect={setSelected} indent={0} />
        <TierGroup label="Co-owners" users={coOwners} currentUserId={currentUserId} onSelect={setSelected} indent={16} />
        {[...restByRole.entries()].map(([role, roleUsers]) => (
          <TierGroup
            key={role}
            label={role.replace(/_/g, " ").toLowerCase()}
            users={roleUsers}
            currentUserId={currentUserId}
            onSelect={setSelected}
            indent={32}
          />
        ))}
        {users.length === 0 && (
          <p className="text-sm text-stone-500">No team members yet.</p>
        )}
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

      {selected && (
        <TeamMemberModal
          user={selected}
          assignableRoles={assignableRoles}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          canEdit={canEdit}
          onClose={() => setSelected(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}
