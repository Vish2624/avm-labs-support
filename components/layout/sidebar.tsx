"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Package, Bell, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";
import { signOutAction } from "@/app/(dashboard)/actions";
import type { AuthUser } from "@/types/auth";

const navItems = [
  { href: "/workspace", label: "Support Workspace", short: "Quote", icon: Search },
  { href: "/profiles", label: "Packages", short: "Packages", icon: Package },
  { href: "/updates", label: "What changed", short: "Updates", icon: Bell },
];

const adminItem = { href: "/admin", label: "Admin", short: "Admin", icon: ShieldCheck };

// Narrow icon rail — also carries what used to be the topbar's identity:
// the logo up top, the signed-in agent's initial + sign out and the theme
// toggle at the bottom. There's no separate topbar in this layout.
export function Sidebar({ user }: { user: AuthUser }) {
  const pathname = usePathname();
  const items = user.role === "admin" ? [...navItems, adminItem] : navItems;
  const initial = user.email.charAt(0).toUpperCase();

  const renderLink = ({ href, label, short, icon: Icon }: (typeof navItems)[number]) => {
    const active = pathname === href || pathname.startsWith(`${href}/`);
    return (
      <Link
        key={href}
        href={href}
        title={label}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex w-full flex-col items-center gap-1.5 rounded-2xl px-1 py-2.5 text-center transition-colors",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        )}
      >
        <Icon className="size-[22px] shrink-0" />
        <span className="text-[11px] leading-tight font-medium">{short}</span>
      </Link>
    );
  };

  return (
    <nav className="flex h-full w-[76px] shrink-0 flex-col items-center gap-1.5 border-r border-sidebar-border bg-sidebar px-2 py-4.5">
      <Link href="/workspace" className="mb-3 shrink-0" title="AVM Labs">
        {/* eslint-disable-next-line @next/next/no-img-element -- static local SVG, no benefit from next/image */}
        <img src="/logo/avm-labs-logo-full.svg" alt="AVM Labs" className="h-auto w-[54px]" />
      </Link>

      {items.map(renderLink)}

      <div className="mt-auto flex flex-col items-center gap-1">
        <ThemeToggle />
        <form action={signOutAction} className="w-full">
          <button
            type="submit"
            title={`Sign out (${user.email})`}
            className="flex w-full flex-col items-center gap-1.5 rounded-2xl px-1 py-2 text-center transition-colors hover:bg-sidebar-accent/60"
          >
            <span className="grid size-[34px] shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
              {initial}
            </span>
            <span className="text-[10.5px] text-sidebar-foreground/55">Sign out</span>
          </button>
        </form>
      </div>
    </nav>
  );
}
