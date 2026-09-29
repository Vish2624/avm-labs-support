import { LoginForm } from "./login-form";
import { BrandPanel } from "./brand-panel";
import { listActiveLocations } from "@/lib/database/locations";
import { safeNextPath } from "@/lib/auth/next-path";

const ease = "cubic-bezier(.2,.8,.2,1)";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  // The page the agent was on before being asked to sign in (proxy.ts).
  const { next } = await searchParams;
  const returnTo = safeNextPath(typeof next === "string" ? next : null) ?? "/workspace";

  // The brand panel's location chips are the real pricing locations; the
  // page still renders (without chips) if they can't be loaded.
  const locations = await listActiveLocations().catch(() => []);

  return (
    <main className="grid min-h-svh grid-cols-1 bg-background lg:grid-cols-[1.1fr_1fr]">
      <BrandPanel locations={locations.map(({ name, currencyCode }) => ({ name, currencyCode }))} />

      <section className="flex min-w-0 flex-col items-center px-6 pt-12 pb-6">
        <div className="my-auto flex w-full max-w-[420px] flex-col gap-8">
          <div className="flex flex-col gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- static local SVG, no benefit from next/image */}
            <img
              src="/logo/avm-labs-logo-full.svg"
              alt="AVM Labs"
              className="mb-4 h-20 w-auto self-start lg:hidden dark:rounded-xl dark:bg-white dark:px-3 dark:py-1.5"
              style={{ animation: `avm-fade-up .6s .05s ${ease} both` }}
            />
            <h1 className="m-0 flex flex-wrap gap-2 text-[34px] font-semibold tracking-[-0.025em]">
              {["Sign", "in", "to"].map((word, index) => (
                <span key={word} className="inline-block" style={{ animation: `avm-word-in .7s ${0.14 + index * 0.06}s ${ease} both` }}>
                  {word}
                </span>
              ))}
              <span className="inline-block" style={{ animation: `avm-word-in .7s .32s ${ease} both` }}>
                AVM Support
              </span>
            </h1>
            <p
              className="m-0 text-[14.5px] text-muted-foreground"
              style={{ animation: `avm-fade-up .6s .38s ${ease} both` }}
            >
              Enter your work email and password to continue.
            </p>
          </div>

          <LoginForm returnTo={returnTo} />

          <p
            className="m-0 text-center text-[13px] text-muted-foreground"
            style={{ animation: `avm-fade-up .6s .34s ${ease} both` }}
          >
            Trouble signing in? Ask an admin to reset your access.
          </p>
        </div>

        <p className="m-0 pt-10 text-center text-xs text-muted-foreground/80">
          © {new Date().getFullYear()} AVM Labs · Internal use only
        </p>
      </section>
    </main>
  );
}
