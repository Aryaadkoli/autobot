"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CreateOrgModal from "./create-org-modal";

// A compact option, not its own card — open to everyone on the Settings
// page (see settings/page.tsx) regardless of role or module permission,
// since creating a new organization only ever creates a brand-new tenant
// the creator becomes OWNER of, so it can't affect any tenant they're
// already in.
export default function OrganizationsSection() {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowCreate(true)}
        className="text-sm text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 underline decoration-dotted underline-offset-4 cursor-pointer whitespace-nowrap"
      >
        + Create another organization
      </button>

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
    </>
  );
}
