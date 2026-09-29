"use client";

import { useTheme } from "@/lib/use-theme";

// Labeled version for the sidebar (theme-toggle.tsx's floating button is
// the one shown on pages with no sidebar, like login/signup).
export default function ThemeSwitch({ collapsed }: { collapsed?: boolean }) {
  const [theme, toggle] = useTheme();
  if (theme === null) return null;
  const isDark = theme === "dark";

  if (collapsed) {
    return (
      <button
        onClick={toggle}
        title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        className="w-full flex items-center justify-center h-9 rounded-lg text-sm cursor-pointer hover:bg-stone-800 hover:text-white"
      >
        {isDark ? "☀" : "☾"}
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm cursor-pointer hover:bg-stone-800 hover:text-white"
    >
      <span>Dark mode</span>
      <span
        className={`relative inline-block h-5 w-9 rounded-full transition-colors ${
          isDark ? "bg-amber-500" : "bg-stone-700"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
            isDark ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}
