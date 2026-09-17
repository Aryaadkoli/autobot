// Reached directly by URL when a role lacks view access — the sidebar already hides the nav link.
export default function NoModuleAccess() {
  return (
    <p className="text-sm text-stone-500 bg-white rounded-2xl border border-stone-200 p-6 max-w-2xl">
      You don&apos;t have access to this. Ask the account owner if you need it.
    </p>
  );
}
