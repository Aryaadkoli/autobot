"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Something went wrong");
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSending(false);
    }
  }

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
          <h1 className="text-[28px] font-medium tracking-tight text-white">Reset your password</h1>
          <p className="mt-2 text-[15px] text-stone-400">
            {done
              ? "Check your inbox for a reset link."
              : "Enter your email and we'll send you a link to reset it."}
          </p>
        </div>

        {done ? (
          <div className="rounded-lg border border-white/10 bg-white/5 backdrop-blur-sm px-4 py-3 text-sm text-stone-300">
            If an account exists for {email}, a reset link is on its way. It expires in an hour.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-300" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 backdrop-blur-sm px-3.5 py-2.5 text-base text-white placeholder-stone-500 outline-none transition-all duration-150 focus:scale-[1.01] focus:border-amber-500/60 focus:ring-4 focus:ring-amber-500/10"
              />
            </div>
            <button
              type="submit"
              disabled={sending}
              className="w-full rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-stone-950 hover:bg-amber-400 disabled:opacity-50 cursor-pointer disabled:cursor-default"
            >
              {sending ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-stone-500">
          <Link href="/login" className="text-amber-500 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
