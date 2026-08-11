"use client";

import { useFormStatus } from "react-dom";

export default function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-amber-500 text-[15px] font-medium text-stone-950 py-2.5 cursor-pointer transition-all duration-150 hover:-translate-y-0.5 hover:bg-amber-400 hover:shadow-lg hover:shadow-amber-500/20 active:translate-y-0 active:scale-[0.98] disabled:cursor-default disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none disabled:active:scale-100"
    >
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}
