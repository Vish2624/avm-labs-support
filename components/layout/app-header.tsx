"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";
import { useQuote } from "@/components/workspace/quote-provider";
import { signOutAction } from "@/app/(dashboard)/actions";
import type { AuthUser } from "@/types/auth";

const navItems = [
  { href: "/workspace", label: "Quote" },
  { href: "/profiles", label: "Packages" },
  { href: "/updates", label: "Updates" },
];

const adminItem = { href: "/admin", label: "Admin" };

// Pages whose content is priced per location — the header's location
// picker only shows on these, so it never looks like it does something on
// a page it doesn't affect (Admin screens keep their own pickers).
const LOCATION_SCOPED_PATHS = ["/workspace", "/profiles"];

function displayName(email: string): string {
  const local = email.split("@")[0] ?? "";
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : "Signed in";
}

// Top app bar: logo + primary nav on the left, the location picker in the
// middle (the one control every quote depends on), identity/sign out on the
// right. Replaces the old icon rail so the workspace gets the full width.
export function AppHeader({ user }: { user: AuthUser }) {
  const pathname = usePathname();
  const { locations, locationId, setLocationId } = useQuote();
  const items = user.role === "admin" ? [...navItems, adminItem] : navItems;
  const showLocation = LOCATION_SCOPED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const name = displayName(user.email);

  return (
    <header className="grid h-20 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-5 border-b border-border bg-card px-5">
      <div className="flex min-w-0 items-center gap-5">
        <Link href="/workspace" className="shrink-0" title="AVM Labs">
          {/* eslint-disable-next-line @next/next/no-img-element -- static local SVG, no benefit from next/image */}
          <img src="/logo/avm-labs-logo-full.svg" alt="AVM Labs" className="h-14 w-auto" />
        </Link>
        <nav className="flex min-w-0 gap-0.5 overflow-x-auto">
          {items.map(({ href, label }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-9 shrink-0 items-center rounded-[9px] px-3.5 text-sm font-medium transition-colors",
                  active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>

      {showLocation && locations.length > 0 ? (
        <label className="relative flex h-8 cursor-pointer items-center gap-2 rounded-full border border-primary/30 bg-primary/[0.06] pr-2 pl-3 text-[11px] font-semibold tracking-[0.05em] text-primary uppercase shadow-[0_0_0_3px] shadow-primary/[0.07]">
          <span className="size-1.5 rounded-full bg-primary" />
          Location
          <select
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
            className="h-7 cursor-pointer appearance-none bg-transparent pr-5 text-[13px] font-semibold tracking-normal text-foreground normal-case outline-none"
          >
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name} ({location.currencyCode})
              </option>
            ))}
          </select>
          <ChevronDownIcon className="pointer-events-none absolute right-2.5 size-3.5 text-muted-foreground" />
        </label>
      ) : (
        <span />
      )}

      <div className="flex items-center justify-end gap-3">
        <ThemeToggle />
        <form action={signOutAction}>
          <button
            type="submit"
            title={`Sign out (${user.email})`}
            className="flex h-10 items-center gap-2.5 rounded-[10px] pr-2.5 pl-1 transition-colors hover:bg-muted"
          >
            <span className="grid size-8 place-items-center rounded-full bg-primary/10 text-[13px] font-semibold text-primary">
              {name.charAt(0)}
            </span>
            <span className="hidden flex-col items-start leading-tight sm:flex">
              <span className="text-[13px] font-medium">{name}</span>
              <span className="text-[11px] text-muted-foreground">
                {user.role === "admin" ? "Admin" : "Agent"} · Sign out
              </span>
            </span>
          </button>
        </form>
      </div>
    </header>
  );
}
