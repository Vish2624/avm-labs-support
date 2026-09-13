import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-svh items-stretch">
      <div className="flex flex-1 flex-col justify-center gap-5 px-[8vw] py-10 sm:max-w-[620px] sm:flex-[1_1_440px]">
        {/* eslint-disable-next-line @next/next/no-img-element -- static local SVG, no benefit from next/image */}
        <img src="/logo/avm-labs-logo-full.svg" alt="AVM Labs — Wellness Laboratory" className="h-auto w-28" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1.5 text-[13.5px] text-muted-foreground">Support Assistant · internal use only</p>
        </div>
        <div className="max-w-sm">
          <LoginForm />
        </div>
      </div>
      <div
        className="hidden flex-1 flex-col justify-end gap-2.5 p-12 sm:flex"
        style={{
          background: "oklch(0.96 0.025 266)",
          backgroundImage: "radial-gradient(30rem 22rem at 90% 10%, oklch(0.7 0.12 60 / 0.22), transparent 62%)",
        }}
      >
        <p className="max-w-[380px] text-lg leading-relaxed font-medium text-accent-foreground">
          Search any test, build the quotation, send the reply — in under a minute.
        </p>
        <p className="text-[13.5px] text-accent-foreground/80">
          Prices come straight from the current price list for each location.
        </p>
      </div>
    </main>
  );
}
