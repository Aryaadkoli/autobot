"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not reset password");
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset password");
    } finally {
      setSaving(false);
    }
  }

  if (!token) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/5 backdrop-blur-sm px-4 py-3 text-sm text-stone-300">
        This link is missing its reset token. Request a new one from the{" "}
        <Link href="/forgot-password" className="text-amber-500 hover:underline">
          forgot password
        </Link>{" "}
        page.
      </div>
    );
  }

  if (done) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/5 backdrop-blur-sm px-4 py-3 text-sm text-stone-300">
        Password updated. Taking you to sign in…
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="space-y-2">
        <label className="text-sm font-medium text-stone-300" htmlFor="newPassword">
          New password
        </label>
        <input
          id="newPassword"
          type="password"
          required
          minLength={8}
          placeholder="At least 8 characters"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-white/5 backdrop-blur-sm px-3.5 py-2.5 text-base text-white placeholder-stone-500 outline-none transition-all duration-150 focus:scale-[1.01] focus:border-amber-500/60 focus:ring-4 focus:ring-amber-500/10"
        />
      </div>
      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-stone-950 hover:bg-amber-400 disabled:opacity-50 cursor-pointer disabled:cursor-default"
      >
        {saving ? "Saving…" : "Reset password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-stone-950 px-6">
      <div
        className="pointer-events-none absolute inset-0 [animation:glow-breathe_5s_ease-in-out_infinite]"
        style={{
          background: "radial-gradient(circle at 50% 35%, rgba(251,191,36,0.14), transparent 55%)",
        }}
      />

      <div className="relative w-full max-w-[380px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-stone-100">
            <div className="h-2 w-2 rounded-full bg-amber-500" />
          </div>
          <h1 className="text-[28px] font-medium tracking-tight text-white">Choose a new password</h1>
        </div>

        <Suspense fallback={null}>
          <ResetPasswordForm />
        </Suspense>

        <p className="mt-6 text-center text-sm text-stone-500">
          <Link href="/login" className="text-amber-500 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
