// Runs before React hydrates (see app/layout.tsx's <head>) so the .dark
// class is already correct on first paint — without this, the page would
// flash light mode for a moment on every load for anyone who chose dark.
// Order of preference: an explicit past choice (localStorage) beats the
// OS-level preference, which beats defaulting to light.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("theme");
    var dark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (dark) document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

export default function ThemeInitScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />;
}
