"use client";

import { useTheme } from "@/lib/use-theme";

// Global floating toggle (rendered once in app/layout.tsx) so it's on
// every page, including login/signup which have no sidebar to hold
// theme-switch.tsx's labeled version.
export default function ThemeToggle() {
  const [theme, toggle] = useTheme();
  if (theme === null) return null;

  return (
    <button
      onClick={toggle}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="fixed bottom-4 right-4 z-50 flex h-11 w-11 items-center justify-center rounded-full border cursor-pointer transition-all
      bg-white/60 backdrop-blur-xl border-stone-200/60 text-stone-700 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.25)] hover:bg-white/80
      dark:bg-stone-900/60 dark:border-white/10 dark:text-amber-300 dark:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)] dark:hover:bg-stone-900/80"
    >
      {theme === "dark" ? (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
        </svg>
      )}
    </button>
  );
}
