"use client";

import { useState } from "react";

export default function PasswordInput({
  autoComplete = "current-password",
}: {
  autoComplete?: "current-password" | "new-password";
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        id="password"
        name="password"
        type={visible ? "text" : "password"}
        required
        autoComplete={autoComplete}
        className="w-full rounded-lg border border-stone-800 bg-stone-900 px-3.5 py-2.5 pr-11 text-base text-white placeholder-stone-500 outline-none transition-all duration-150 focus:scale-[1.01] focus:border-amber-500/60 focus:ring-4 focus:ring-amber-500/10"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute right-0 top-0 flex h-full w-11 cursor-pointer items-center justify-center text-stone-500 transition-colors hover:text-stone-300"
      >
        {visible ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-[18px] w-[18px]"
          >
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-[18px] w-[18px]"
          >
            <path d="M3 3l18 18" />
            <path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a13.2 13.2 0 0 1-3.1 3.9M6.6 6.6C4 8.3 2 12 2 12s3.5 7 10 7a9.8 9.8 0 0 0 4.4-1" />
            <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
          </svg>
        )}
      </button>
    </div>
  );
}
