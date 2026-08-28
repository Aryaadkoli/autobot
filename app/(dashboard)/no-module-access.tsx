// Shown instead of a page's real content when the signed-in role can't
// view that module — reached directly by URL, since the sidebar already
// hides the nav link entirely (see (dashboard)/layout.tsx).
export default function NoModuleAccess() {
  return (
    <p className="text-sm text-stone-500 bg-white rounded-2xl border border-stone-200 p-6 max-w-2xl">
      You don&apos;t have access to this. Ask the account owner if you need it.
    </p>
  );
}
