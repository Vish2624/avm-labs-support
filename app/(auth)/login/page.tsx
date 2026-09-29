import { LoginForm } from "./login-form";
import { safeNextPath } from "@/lib/auth/next-path";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  // The page the agent was on before being asked to sign in (proxy.ts).
  const { next } = await searchParams;
  const returnTo = safeNextPath(typeof next === "string" ? next : null) ?? "/workspace";

  return (
    <main className="grid min-h-svh place-items-center bg-muted/40 px-4 py-10">
      <div className="flex w-full max-w-[400px] flex-col items-center gap-6">
        {/* eslint-disable-next-line @next/next/no-img-element -- static local SVG, no benefit from next/image */}
        <img
          src="/logo/avm-labs-logo-full.svg"
          alt="AVM Labs"
          className="h-24 w-auto rounded-xl max-sm:h-20 dark:bg-white dark:p-1.5"
        />

        <div className="w-full rounded-2xl border border-border bg-card p-8 shadow-[0_20px_50px_-24px_rgb(0_0_0/0.25)] max-sm:p-6">
          <div className="mb-7 flex flex-col items-center gap-1.5 text-center">
            <h1 className="m-0 text-2xl font-semibold tracking-[-0.02em]">Sign in to AVM Support</h1>
            <p className="m-0 text-sm text-muted-foreground">Enter your work email and password</p>
          </div>

          <LoginForm returnTo={returnTo} />
        </div>

        <p className="m-0 text-center text-[13px] leading-relaxed text-muted-foreground">
          Internal use only. Trouble signing in? Ask an admin to reset your access.
        </p>
      </div>
    </main>
  );
}
