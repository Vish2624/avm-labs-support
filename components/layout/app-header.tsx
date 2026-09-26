"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties } from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

// Sets `--loc` to the location's own colour token (see globals.css), falling
// back to the brand colour for a location code without one.
function locationColor(code: string | undefined): CSSProperties {
  return { "--loc": code ? `var(--loc-${code.toLowerCase()}, var(--primary))` : "var(--primary)" } as CSSProperties;
}

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
  const selectedLocation = locations.find((location) => location.id === locationId);

  return (
    <header className="relative z-20 grid h-[88px] shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-5 border-b border-border bg-card px-5">
      <div className="flex min-w-0 items-center gap-5">
        <Link href="/workspace" className="shrink-0" title="AVM Support">
          {/* eslint-disable-next-line @next/next/no-img-element -- static local SVG, no benefit from next/image */}
          <img src="/logo/avm-labs-logo-full.svg" alt="AVM Labs" className="h-[72px] w-auto rounded-lg p-0.5 dark:bg-white" />
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
                  "flex h-9 shrink-0 items-center rounded-[10px] px-3 text-sm font-medium transition-colors duration-200",
                  active ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>

      {showLocation && locations.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Pricing location"
            style={locationColor(selectedLocation?.code)}
            className="group relative flex h-11 cursor-pointer items-center gap-2.5 rounded-full border border-(--loc)/35 bg-(--loc)/[0.07] pr-3.5 pl-4 text-[11px] font-semibold tracking-[0.06em] whitespace-nowrap text-(--loc) uppercase shadow-[0_2px_10px_-4px] shadow-(color:--loc)/30 transition-[background,border-color,box-shadow,transform,translate,scale,rotate] duration-200 outline-none hover:-translate-y-px hover:border-(--loc)/60 hover:bg-(--loc)/[0.12] hover:shadow-[0_8px_20px_-8px] hover:shadow-(color:--loc)/40 focus-visible:ring-2 focus-visible:ring-(--loc)/40 data-popup-open:border-(--loc)/60 data-popup-open:bg-(--loc)/[0.14]"
          >
            {/* Attention motion: a ring in the location's colour ripples out, a light sweeps across,
                and the dot pings — so the pricing location is never missed. */}
            <span aria-hidden className="pointer-events-none absolute -inset-px rounded-full border-2 border-(--loc)/50 avm-location-ring" />
            <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
              <span className="absolute inset-y-0 left-0 w-1/3 avm-location-shine" />
            </span>
            <span aria-hidden className="relative grid size-2.5 place-items-center">
              <span className="absolute size-full animate-ping rounded-full bg-(--loc)/60" />
              <span className="relative size-2.5 rounded-full bg-(--loc)" />
            </span>
            <span
              key={locationId}
              className="relative text-[15px] font-semibold tracking-normal text-(--loc) normal-case avm-check"
            >
              {selectedLocation ? `${selectedLocation.name} (${selectedLocation.currencyCode})` : "Select"}
            </span>
            <ChevronDownIcon className="relative size-4 text-(--loc)/70 transition-transform duration-250 group-data-popup-open:rotate-180" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" sideOffset={8} className="w-64 rounded-[14px] p-1.5 shadow-elevated avm-pop">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="px-2.5 pt-1 pb-1.5 text-[11px] font-semibold tracking-[0.05em] uppercase">
                Pricing location
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup value={locationId} onValueChange={(value) => setLocationId(value as string)}>
                {locations.map((location) => (
                  <DropdownMenuRadioItem
                    key={location.id}
                    value={location.id}
                    style={locationColor(location.code)}
                    className="h-9 cursor-pointer gap-2.5 pr-9 font-medium data-checked:bg-(--loc)/10 data-checked:text-(--loc)"
                  >
                    <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-(--loc)" />
                    <span className="flex-1">{location.name}</span>
                    <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-muted-foreground">
                      {location.currencyCode}
                    </span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span />
      )}

      <div className="flex items-center justify-end gap-3">
        <ThemeToggle />
        <form action={signOutAction}>
          <button
            type="submit"
            title={`Sign out (${user.email})`}
            className="flex h-[42px] items-center gap-2.5 rounded-[11px] pr-2.5 pl-1 transition-colors hover:bg-muted"
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
