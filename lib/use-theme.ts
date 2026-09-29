"use client";

import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const THEME_CHANGE_EVENT = "autobot:theme-change";

function currentTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

// Shared by every toggle instance on the page (the sidebar switch and the
// floating button both render at once in the dashboard) — dispatching this
// event on change is what keeps them in sync without lifting state into a
// shared ancestor.
function setTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem("theme", theme);
  } catch {
    // Private-window/blocked storage — the toggle still works for this
    // page view, it just won't be remembered next visit.
  }
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: theme }));
}

// Starts null so the first client render matches whatever
// theme-init-script.tsx already set on <html> before hydration, then reads
// the real value from the DOM once mounted.
export function useTheme(): [Theme | null, () => void] {
  const [theme, setThemeState] = useState<Theme | null>(null);

  useEffect(() => {
    // Deliberately not a lazy useState initializer: this runs during SSR
    // too (document is undefined there), so the first client render must
    // also produce null to match the server-rendered HTML — only an
    // effect (which never runs on the server) can safely read the real
    // value without causing a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeState(currentTheme());
    function onChange(e: Event) {
      setThemeState((e as CustomEvent<Theme>).detail);
    }
    window.addEventListener(THEME_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, onChange);
  }, []);

  function toggle() {
    setTheme(currentTheme() === "dark" ? "light" : "dark");
  }

  return [theme, toggle];
}
