"use client";

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

      {userRole === "OWNER" && (
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

      <p className="text-xs text-stone-400 mt-5">
        Password reset and notification preferences are coming soon.
      </p>

      <button
        onClick={onClose}
        className="mt-5 rounded-lg border border-stone-300 text-stone-700 text-sm px-4 py-2 hover:bg-stone-100 cursor-pointer"
      >
        Close
      </button>
    </Modal>
  );
}
