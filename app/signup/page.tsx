import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import PasswordInput from "../login/password-input";
import SubmitButton from "../login/submit-button";
import Mascot from "@/components/mascot";
import { signupNewBusiness } from "@/lib/accounts";
import { checkRateLimit } from "@/lib/rate-limit";

// Same throttle shape as login/password-change (lib/rate-limit.ts) —
// this endpoint was the one place left with no abuse protection at all:
// unauthenticated, and signupNewBusiness()'s "wrong password for an
// existing email" error also confirms whether an email is already
// registered, which makes it scriptable for both spam-tenant creation
// and account-existence probing without this.
const SIGNUP_ATTEMPT_LIMIT = 5;
const SIGNUP_ATTEMPT_WINDOW_SECONDS = 15 * 60;

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  async function createAccount(formData: FormData) {
    "use server";
    const businessName = String(formData.get("businessName") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");

    if (!businessName || !name || !email || password.length < 8) {
      redirect(`/signup?error=${encodeURIComponent("Fill in every field — password needs at least 8 characters.")}`);
    }

    const { allowed } = await checkRateLimit(
      `signup:${email}`,
      SIGNUP_ATTEMPT_LIMIT,
      SIGNUP_ATTEMPT_WINDOW_SECONDS
    );
    if (!allowed) {
      redirect(`/signup?error=${encodeURIComponent("Too many attempts — try again in a few minutes.")}`);
    }

    try {
      await signupNewBusiness({ businessName, name, email, password });
    } catch (e) {
      if (e instanceof Error) {
        redirect(`/signup?error=${encodeURIComponent(e.message)}`);
      }
      throw e;
    }

    try {
      await signIn("credentials", { email, password, redirectTo: "/" });
    } catch (e) {
      if (e instanceof AuthError) redirect("/login?error=1");
      throw e; // redirects in Next.js are thrown errors — re-throw them
    }
  }

  return (
    <div className="flex min-h-screen bg-stone-950">
      <aside className="relative hidden w-1/2 flex-col items-center justify-center gap-10 overflow-hidden border-r border-stone-900 p-14 lg:flex">
        <div className="absolute left-8 top-8 flex items-center gap-2.5 opacity-0 [animation:fade-in-up_0.5s_ease-out_forwards]">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-100">
            <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          </div>
          <span className="text-lg font-medium tracking-tight text-white">
            Autobot
          </span>
        </div>

        <div className="relative max-w-md opacity-0 [animation:fade-in-up_0.5s_ease-out_0.1s_forwards]">
          <Mascot className="mb-8" />

          <h2 className="text-[32px] font-medium leading-tight tracking-tight text-white">
            Set up your business in a minute.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-stone-400">
            One login works across every business you run — add another one
            later with the same email and you&apos;ll just pick which to
            work in.
          </p>
        </div>

        <p className="relative text-xs text-stone-600 opacity-0 [animation:fade-in-up_0.5s_ease-out_0.5s_forwards]">
          Trusted by Surabharati and growing businesses across India.
        </p>
      </aside>

      <main className="relative flex w-full flex-1 items-center justify-center overflow-hidden bg-stone-950 px-6 lg:w-1/2 py-10">
        <div
          className="pointer-events-none absolute inset-0 [animation:glow-breathe_5s_ease-in-out_infinite]"
          style={{
            background:
              "radial-gradient(circle at 50% 35%, rgba(251,191,36,0.14), transparent 55%)",
          }}
        />

        <div className="relative w-full max-w-[380px]">
          <div className="mb-8 flex flex-col items-center text-center opacity-0 [animation:fade-in-up_0.5s_ease-out_forwards]">
            <span className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-500/80">
              Customer Automation, Simplified
            </span>
            <h1 className="text-[28px] font-medium tracking-tight text-white">
              Create your account
            </h1>
            <p className="mt-2 text-[15px] text-stone-400">
              This creates a new business on Autobot
            </p>
          </div>

          <form action={createAccount} className="space-y-4">
            {error && (
              <p className="text-sm text-red-400 [animation:shake_0.4s_ease-in-out]">
                {error}
              </p>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-300" htmlFor="businessName">
                Business name
              </label>
              <input
                id="businessName"
                name="businessName"
                required
                placeholder="e.g. Surabharati"
                className="w-full rounded-lg border border-stone-800 bg-stone-900 px-3.5 py-2.5 text-base text-white placeholder-stone-500 outline-none transition-all duration-150 focus:scale-[1.01] focus:border-amber-500/60 focus:ring-4 focus:ring-amber-500/10"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-300" htmlFor="name">
                Your name
              </label>
              <input
                id="name"
                name="name"
                required
                autoComplete="name"
                className="w-full rounded-lg border border-stone-800 bg-stone-900 px-3.5 py-2.5 text-base text-white placeholder-stone-500 outline-none transition-all duration-150 focus:scale-[1.01] focus:border-amber-500/60 focus:ring-4 focus:ring-amber-500/10"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-300" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="w-full rounded-lg border border-stone-800 bg-stone-900 px-3.5 py-2.5 text-base text-white placeholder-stone-500 outline-none transition-all duration-150 focus:scale-[1.01] focus:border-amber-500/60 focus:ring-4 focus:ring-amber-500/10"
              />
              <p className="text-xs text-stone-500">
                Already used Autobot for another business? Use the same email
                and password to add this one to it.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-300" htmlFor="password">
                Password
              </label>
              <PasswordInput autoComplete="new-password" />
              <p className="text-xs text-stone-500">At least 8 characters.</p>
            </div>

            <div className="pt-2">
              <SubmitButton label="Create account" pendingLabel="Creating…" />
            </div>
          </form>

          <p className="mt-6 text-center text-sm text-stone-500">
            Already have an account?{" "}
            <Link href="/login" className="text-amber-500 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
