"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CreateOrgModal from "./settings/create-org-modal";

// The zero-membership empty state's "Create your own business" button —
// used to just link to /signup, which forces re-entering a password the
// session already proves (same account, extra friction). Reuses the
// Settings "new organization" flow instead (POST /api/organizations,
// eligible for a zero-membership Account too — see that route).
export default function CreateOrgButton() {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowCreate(true)}
        className="rounded-lg bg-amber-500 text-stone-950 text-sm font-medium px-5 py-2.5 hover:bg-amber-400 transition-colors cursor-pointer"
      >
        Create your own business
      </button>

      {showCreate && (
        <CreateOrgModal
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            router.push("/");
            router.refresh();
          }}
        />
      )}
    </>
  );
}
