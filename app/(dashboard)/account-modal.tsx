"use client";

import { useState } from "react";
import Link from "next/link";
import Modal from "@/components/modal";

export default function AccountModal({
  tenantName,
  userName,
  userEmail,
  userRole,
  onClose,
}: {
  tenantName: string;
  userName: string;
  userEmail: string;
  userRole: string;
  onClose: () => void;
}) {
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch("/api/users/me/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not change password");
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change password");
    } finally {
      setSaving(false);
    }
  }

  const fields = [
    { label: "Name", value: userName || "—" },
    { label: "Email", value: userEmail || "—" },
    { label: "Role", value: userRole || "—" },
    { label: "Business", value: tenantName || "—" },
  ];

  return (
    <Modal title="Account" onClose={onClose}>
      <div className="space-y-4">
        {fields.map((f) => (
          <div key={f.label}>
            <div className="text-xs text-stone-500">{f.label}</div>
            <div className="text-sm text-stone-900 mt-0.5">{f.value}</div>
          </div>
        ))}
      </div>

      {(userRole === "OWNER" || userRole === "CO_OWNER") && (
        <Link
          href="/settings"
          onClick={onClose}
          className="mt-6 block rounded-lg border border-stone-200 px-3 py-2.5 hover:bg-stone-50"
        >
          <div className="text-sm text-stone-900 font-medium">
            Manage team
          </div>
          <div className="text-xs text-stone-500 mt-0.5">
            Add or remove teammates who can log in
          </div>
        </Link>
      )}

      <div className="mt-6 pt-5 border-t border-stone-200">
        {!showPasswordForm ? (
          <button
            onClick={() => setShowPasswordForm(true)}
            className="text-sm text-amber-700 hover:underline cursor-pointer"
          >
            Change password
          </button>
        ) : (
          <form onSubmit={handleChangePassword} className="space-y-3">
            {error && (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            {success && (
              <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                Password changed.
              </p>
            )}
            <div>
              <label className="block text-sm text-stone-700 mb-1">
                Current password
              </label>
              <input
                required
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-sm text-stone-700 mb-1">
                New password
              </label>
              <input
                required
                type="password"
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-stone-900 text-white text-sm px-4 py-2 hover:bg-stone-800 disabled:opacity-50 cursor-pointer disabled:cursor-default"
              >
                {saving ? "Saving…" : "Save new password"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPasswordForm(false);
                  setError(null);
                  setCurrentPassword("");
                  setNewPassword("");
                }}
                className="rounded-lg border border-stone-300 text-stone-700 text-sm px-4 py-2 hover:bg-stone-100 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
        <p className="text-xs text-stone-400 mt-4">
          Notification preferences are coming soon.
        </p>
      </div>

      <button
        onClick={onClose}
        className="mt-5 rounded-lg border border-stone-300 text-stone-700 text-sm px-4 py-2 hover:bg-stone-100 cursor-pointer"
      >
        Close
      </button>
    </Modal>
  );
}
