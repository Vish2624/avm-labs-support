"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
          <DropdownMenuTrigger className="group flex h-[34px] cursor-pointer items-center gap-2 rounded-full border border-border bg-primary/10 pr-2.5 pl-3 text-[11px] font-semibold tracking-[0.06em] whitespace-nowrap text-primary uppercase transition-[background,transform,translate,scale,rotate] duration-200 outline-none hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-primary/40 data-popup-open:bg-primary/15">
            <span className="size-1.5 rounded-full bg-primary avm-pulse" />
            Location
            <span className="text-[13px] tracking-normal text-foreground normal-case">
              {selectedLocation ? `${selectedLocation.name} (${selectedLocation.currencyCode})` : "Select"}
            </span>
            <ChevronDownIcon className="size-3.5 text-muted-foreground transition-transform duration-250 group-data-popup-open:rotate-180" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" sideOffset={8} className="w-60 rounded-[14px] p-1.5 shadow-elevated avm-pop">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="px-2.5 pt-1 pb-1.5 text-[11px] font-semibold tracking-[0.05em] uppercase">
                Pricing location
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup value={locationId} onValueChange={(value) => setLocationId(value as string)}>
                {locations.map((location) => (
                  <DropdownMenuRadioItem
                    key={location.id}
                    value={location.id}
                    className="h-9 cursor-pointer gap-2.5 pr-9 font-medium data-checked:text-primary"
                  >
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
