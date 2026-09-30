"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/modal";

export default function AccountModal({
  tenantName,
  userName,
  userEmail,
  userPhone,
  memberSince,
  userRole,
  memberships,
  onClose,
}: {
  tenantName: string;
  userName: string;
  userEmail: string;
  userPhone: string | null;
  memberSince: string | null;
  userRole: string;
  memberships: { tenantName: string; role: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState(userPhone ?? "");
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

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

  async function handleSavePhone() {
    setSavingPhone(true);
    setPhoneError(null);
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneInput.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save phone number");
      setEditingPhone(false);
      router.refresh();
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : "Could not save phone number");
    } finally {
      setSavingPhone(false);
    }
  }

  const otherMemberships = memberships.filter(
    (m) => !(m.tenantName === tenantName && m.role === userRole)
  );

  return (
    <Modal title="Account" onClose={onClose}>
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-xl font-semibold text-stone-900">{userName || "—"}</h3>
          <p className="text-sm text-stone-500 mt-0.5">{userEmail || "—"}</p>
        </div>
        {userRole && (
          <span className="text-[10px] uppercase tracking-wide text-stone-700 bg-stone-100 border border-stone-200 rounded-full px-2 py-0.5">
            {userRole}
          </span>
        )}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-stone-500">Business</div>
          <div className="text-stone-900 mt-0.5">{tenantName || "—"}</div>
        </div>
        <div>
          <div className="text-stone-500">Member since</div>
          <div className="text-stone-900 mt-0.5">
            {memberSince
              ? new Date(memberSince).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : "—"}
          </div>
        </div>
        <div>
          <div className="text-stone-500">Phone</div>
          {editingPhone ? (
            <div className="mt-1 flex items-center gap-2">
              <input
                autoFocus
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="Add a phone number"
                className="flex-1 rounded-lg border border-stone-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <button
                onClick={handleSavePhone}
                disabled={savingPhone}
                className="text-xs text-stone-700 hover:text-stone-900 cursor-pointer disabled:opacity-50"
              >
                Save
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setPhoneInput(userPhone ?? "");
                setEditingPhone(true);
              }}
              className="block text-stone-900 mt-0.5 hover:text-amber-600 cursor-pointer text-left"
            >
              {userPhone || <span className="text-stone-400">Add a phone number</span>}
            </button>
          )}
          {phoneError && <p className="text-xs text-red-600 mt-1">{phoneError}</p>}
        </div>
      </div>

      {otherMemberships.length > 0 && (
        <div className="mt-5">
          <div className="text-sm text-stone-500 mb-1.5">Also a member of</div>
          <div className="space-y-1">
            {otherMemberships.map((m) => (
              <div
                key={m.tenantName}
                className="flex items-center justify-between text-sm bg-stone-50 border border-stone-100 rounded-lg px-3 py-1.5"
              >
                <span className="text-stone-900">{m.tenantName}</span>
                <span className="text-[10px] uppercase tracking-wide text-stone-500">{m.role}</span>
              </div>
            ))}
          </div>
        </div>
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
