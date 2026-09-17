"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CreateOrgModal from "./create-org-modal";

// Only rendered for an OWNER (see settings/page.tsx) — creating a new
// organization makes you its owner, so this isn't offered to CO_OWNER or
// anyone else, same "owners only" framing as granting CO_OWNER elsewhere.
export default function OrganizationsSection() {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="max-w-2xl">
      <div className="bg-white rounded-2xl border border-stone-200 p-5 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-stone-700">Organizations</h2>
          <p className="text-xs text-stone-500 mt-1">
            Running more than one business? Create another organization under this
            same login.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-stone-900 text-white text-sm px-3 py-1.5 hover:bg-stone-800 cursor-pointer whitespace-nowrap"
        >
          + New organization
        </button>
      </div>

      {showCreate && (
        <CreateOrgModal
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            // The API route already switched the active tenant on the
            // session (unstable_update) — reload so the layout/sidebar
            // pick up the fresh cookie and land on the new org's Overview.
            router.push("/");
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
