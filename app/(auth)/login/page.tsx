import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="grid min-h-svh place-items-center bg-background p-6">
      <div className="flex w-full max-w-[400px] flex-col gap-7">
        {/* eslint-disable-next-line @next/next/no-img-element -- static local SVG, no benefit from next/image */}
        <img src="/logo/avm-labs-logo-full.svg" alt="AVM Labs — Wellness Laboratory" className="h-auto w-[92px]" />
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Sign in to Support</h1>
          <p className="mt-1.5 text-sm leading-normal text-muted-foreground">
            Search any test, build the quotation, send the reply — in under a minute.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-[0_1px_2px_oklch(0.2_0.02_258/0.04)]">
          <LoginForm />
        </div>
        <p className="text-[13px] text-muted-foreground">
          Internal use only. Trouble signing in? Ask an admin to reset your access.
        </p>
      </div>
    </main>
  );
}
