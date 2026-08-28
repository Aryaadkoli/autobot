"use client";

import { useState } from "react";
import Modal from "@/components/modal";

type AssignableRole = { id: string; name: string };

export default function UserModal({
  assignableRoles,
  onClose,
  onSaved,
}: {
  assignableRoles: AssignableRole[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const defaultRole = assignableRoles.find((r) => r.name === "MEMBER") ?? assignableRoles[0];
  const [roleId, setRoleId] = useState(defaultRole?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
          roleId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not add teammate");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add teammate");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Add teammate" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div>
          <label className="block text-sm text-stone-700 mb-1">Name</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <div>
          <label className="block text-sm text-stone-700 mb-1">Email</label>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <div>
          <label className="block text-sm text-stone-700 mb-1">
            Temporary password
          </label>
          <input
            required
            type="text"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters — share this with them"
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <div>
          <label className="block text-sm text-stone-700 mb-1">Role</label>
          <select
            required
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            {assignableRoles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-stone-900 text-white text-sm px-4 py-2.5 hover:bg-stone-800 disabled:opacity-50 cursor-pointer disabled:cursor-default"
          >
            {saving ? "Adding…" : "Add teammate"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-stone-300 text-stone-700 text-sm px-4 py-2.5 hover:bg-stone-100 cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
