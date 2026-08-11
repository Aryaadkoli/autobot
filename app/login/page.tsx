import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import PasswordInput from "./password-input";
import SubmitButton from "./submit-button";
import Mascot from "@/components/mascot";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  async function authenticate(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirectTo: "/",
      });
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
            Your best salesperson never sleeps.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-stone-400">
            Autobot is the follow-up engine behind growing businesses —
            remembering every lead and customer so you don&apos;t have to,
            and reaching out at exactly the right moment, every time.
          </p>

          <ul className="mt-8 space-y-4">
            {[
              "Never lose track of a lead again",
              "Live delivery, open & click analytics",
              "Built-in compliance: quiet hours & send caps",
            ].map((item, i) => (
              <li
                key={item}
                className="flex items-start gap-3 text-sm text-stone-300 opacity-0 [animation:fade-in-up_0.5s_ease-out_forwards]"
                style={{ animationDelay: `${0.2 + i * 0.1}s` }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-stone-600 opacity-0 [animation:fade-in-up_0.5s_ease-out_0.5s_forwards]">
          Trusted by Surabharati and growing businesses across India.
        </p>
      </aside>

      <main className="relative flex w-full flex-1 items-center justify-center overflow-hidden bg-stone-950 px-6 lg:w-1/2">
      <div
        className="pointer-events-none absolute inset-0 [animation:glow-breathe_5s_ease-in-out_infinite]"
        style={{
          background:
            "radial-gradient(circle at 50% 35%, rgba(251,191,36,0.14), transparent 55%)",
        }}
      />

      <div className="relative w-full max-w-[380px]">
        <div className="mb-10 flex flex-col items-center text-center opacity-0 [animation:fade-in-up_0.5s_ease-out_forwards]">
          <span className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-500/80">
            Customer Automation, Simplified
          </span>
          <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-stone-100 [animation:glow-pulse_2.8s_ease-in-out_infinite]">
            <div className="h-2 w-2 rounded-full bg-amber-500" />
          </div>
          <h1 className="text-[28px] font-medium tracking-tight text-white">
            Sign in to Autobot
          </h1>
          <p className="mt-2 text-[15px] text-stone-400">
            Enter your credentials to continue
          </p>
        </div>

        <form action={authenticate} className="space-y-5">
          {error && (
            <p className="text-sm text-red-400 [animation:shake_0.4s_ease-in-out]">
              Wrong email or password. Try again.
            </p>
          )}

          <div className="space-y-2 opacity-0 [animation:fade-in-up_0.5s_ease-out_0.1s_forwards]">
            <label
              className="text-sm font-medium text-stone-300"
              htmlFor="email"
            >
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
          </div>

          <div className="space-y-2 opacity-0 [animation:fade-in-up_0.5s_ease-out_0.2s_forwards]">
            <label
              className="text-sm font-medium text-stone-300"
              htmlFor="password"
            >
              Password
            </label>
            <PasswordInput />
          </div>

          <div className="pt-2 opacity-0 [animation:fade-in-up_0.5s_ease-out_0.3s_forwards]">
            <SubmitButton />
          </div>
        </form>

        <div className="mt-10 flex flex-col items-center gap-2 opacity-0 [animation:fade-in-up_0.5s_ease-out_0.4s_forwards]">
          <div className="flex items-center gap-1.5 text-xs text-stone-500">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
            >
              <rect x="4" y="10" width="16" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            Encrypted &amp; securely stored
          </div>
          <p className="text-xs text-stone-600">
            © {new Date().getFullYear()} Surabharati · Powered by Autobot
          </p>
        </div>
      </div>
      </main>
    </div>
  );
}
