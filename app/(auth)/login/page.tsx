import { LoginForm } from "./login-form";
import { BrandPanel } from "./brand-panel";
import { FormSide } from "./form-side";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { listActiveLocations } from "@/lib/database/locations";

const ease = "cubic-bezier(.2,.8,.2,1)";

export default async function LoginPage() {
  // The brand panel's location chips are the real pricing locations; the
  // page still renders (without chips) if they can't be loaded.
  const locations = await listActiveLocations().catch(() => []);

  return (
    <main className="grid min-h-svh grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] bg-background">
      <BrandPanel locations={locations.map(({ name, currencyCode }) => ({ name, currencyCode }))} />

      <FormSide>
        <div className="absolute top-6 right-6">
          <ThemeToggle />
        </div>

        <div className="relative flex w-full max-w-[380px] flex-col gap-7">
          <div className="flex flex-col gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- static local SVG, no benefit from next/image */}
            <img
              src="/logo/avm-labs-logo-full.svg"
              alt="AVM Labs"
              className="mb-3 h-20 w-auto self-start rounded-xl dark:bg-white dark:p-1.5"
              style={{ animation: `avm-fade-up .6s .05s ${ease} both` }}
            />
            <span
              className="flex items-center gap-[7px] self-start rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
              style={{ animation: `avm-fade-up .6s .1s ${ease} both` }}
            >
              <span className="size-1.5 rounded-full bg-primary avm-pulse" />
              Welcome back
            </span>
            <h1 className="m-0 flex flex-wrap gap-2 text-[32px] font-semibold tracking-[-0.025em]">
              {["Sign", "in", "to"].map((word, index) => (
                <span key={word} className="inline-block" style={{ animation: `avm-word-in .7s ${0.14 + index * 0.06}s ${ease} both` }}>
                  {word}
                </span>
              ))}
              <span
                className="inline-block avm-shimmer-text"
                style={{ animation: `avm-word-in .7s .32s ${ease} both, avm-shimmer 5s 1s linear infinite` }}
              >
                AVM Support
              </span>
            </h1>
          </div>

          <LoginForm />

          <p
            className="m-0 border-t border-border pt-5 text-[13px] leading-relaxed text-muted-foreground"
            style={{ animation: `avm-fade-up .6s .34s ${ease} both` }}
          >
            Internal use only. Trouble signing in? Ask an admin to reset your access.
          </p>
        </div>
      </FormSide>
    </main>
  );
}
