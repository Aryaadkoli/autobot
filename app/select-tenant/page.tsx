import { redirect } from "next/navigation";
import { requireAccountSession, unstable_update, signOut } from "@/auth";
import Mascot from "@/components/mascot";

// Shown only when the Account has 2+ Tenant memberships and none is selected yet; a lone membership auto-selects at sign-in (auth.ts).
export default async function SelectTenantPage() {
  const session = await requireAccountSession();

  // Also reachable with a tenant already selected, via the sidebar's "Switch business" link.
  if (session.memberships.length <= 1) redirect("/");

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="min-h-screen bg-stone-950 flex flex-col items-center justify-center px-6 py-12">
      <Mascot className="mb-6 opacity-0 [animation:fade-in-up_0.5s_ease-out_forwards]" />
      <div className="w-full max-w-2xl text-center opacity-0 [animation:fade-in-up_0.5s_ease-out_0.1s_forwards]">
        <h1 className="text-2xl font-medium text-white">
          Which business, {session.name || session.email}?
        </h1>
        <p className="mt-2 text-sm text-stone-400">
          {session.email} is part of {session.memberships.length} businesses
          on Autobot.
        </p>
      </div>

      <div className="mt-10 w-full max-w-2xl grid grid-cols-1 sm:grid-cols-2 gap-4 opacity-0 [animation:fade-in-up_0.5s_ease-out_0.2s_forwards]">
        {session.memberships.map((m) => {
          async function pick() {
            "use server";
            await unstable_update({ user: { tenantId: m.tenantId } as never });
            redirect("/");
          }
          return (
            <form key={m.tenantId} action={pick}>
              <button
                type="submit"
                className="w-full text-left rounded-2xl border border-stone-800 bg-stone-900 p-5 hover:border-amber-500/60 hover:bg-stone-800 transition-colors cursor-pointer"
              >
                <div className="text-lg font-medium text-white">{m.tenantName}</div>
                <div className="text-[11px] text-amber-500/80 mt-1 uppercase tracking-wide">
                  {m.role}
                </div>
              </button>
            </form>
          );
        })}
      </div>

      <form action={logout} className="mt-10 opacity-0 [animation:fade-in-up_0.5s_ease-out_0.3s_forwards]">
        <button
          type="submit"
          className="text-sm text-stone-500 hover:text-stone-300 cursor-pointer"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
