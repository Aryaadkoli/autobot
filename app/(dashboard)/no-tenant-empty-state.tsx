import Link from "next/link";
import { signOut } from "@/auth";
import Mascot from "@/components/mascot";

// Shown instead of the dashboard when an Account exists but has zero
// tenant memberships — a real, reachable state (not just theoretical):
// someone signed up but hasn't been added to a business yet, or an
// account was created purely for review/testing.
export default function NoTenantEmptyState({
  name,
  email,
}: {
  name: string;
  email: string;
}) {
  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="min-h-screen bg-stone-950 flex flex-col items-center justify-center px-6 text-center">
      <Mascot className="mb-8 opacity-0 [animation:fade-in-up_0.5s_ease-out_forwards]" />
      <h1 className="text-2xl font-medium text-white opacity-0 [animation:fade-in-up_0.5s_ease-out_0.1s_forwards]">
        You&apos;re not part of any business yet
      </h1>
      <p className="mt-2 text-sm text-stone-400 max-w-sm opacity-0 [animation:fade-in-up_0.5s_ease-out_0.2s_forwards]">
        {name ? `Hi ${name}, ` : ""}
        {email} isn&apos;t a teammate on any business on Autobot. Start your
        own, or ask an existing owner to add this email from their Settings
        page.
      </p>
      <div className="mt-8 flex flex-col sm:flex-row items-center gap-3 opacity-0 [animation:fade-in-up_0.5s_ease-out_0.3s_forwards]">
        <Link
          href="/signup"
          className="rounded-lg bg-amber-500 text-stone-950 text-sm font-medium px-5 py-2.5 hover:bg-amber-400 transition-colors"
        >
          Create your own business
        </Link>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-lg border border-stone-700 text-stone-300 text-sm px-5 py-2.5 hover:bg-stone-900 cursor-pointer transition-colors"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
