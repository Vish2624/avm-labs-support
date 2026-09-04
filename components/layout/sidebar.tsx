"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, LibraryBig, Bell, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types/auth";

const navItems = [
  { href: "/workspace", label: "Support Workspace", icon: Search },
  { href: "/profiles", label: "Profile Search", icon: LibraryBig },
  { href: "/updates", label: "Updates", icon: Bell },
];

const adminItem = { href: "/admin", label: "Admin", icon: ShieldCheck };

export function Sidebar({ role }: { role: UserRole }) {
  const pathname = usePathname();

  const renderLink = ({ href, label, icon: Icon }: (typeof navItems)[number]) => {
    const active = pathname === href || pathname.startsWith(`${href}/`);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-2.5 rounded-full px-3 py-2 text-sm transition-colors",
          active
            ? "bg-primary text-primary-foreground font-medium shadow-sm"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        )}
      >
        <Icon className="size-4 shrink-0" />
        {label}
      </Link>
    );
  };

  return (
    <nav className="flex h-full w-60 shrink-0 flex-col gap-1 border-r border-sidebar-border bg-sidebar p-3.5 backdrop-blur-xl">
      <div className="flex items-center gap-2.5 px-1.5 py-3">
        <span className="grid size-8 place-items-center rounded-xl bg-gradient-to-br from-primary to-[oklch(0.6_0.22_300)] text-xs font-bold text-primary-foreground shadow-glow">
          AV
        </span>
        <span className="text-sm font-semibold tracking-tight">AVM Labs</span>
      </div>
      {navItems.map(renderLink)}
      {role === "admin" ? (
        <>
          <div className="mx-2 my-2 border-t border-sidebar-border" />
          <div className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-sidebar-foreground/50">
            Admin
          </div>
          {renderLink(adminItem)}
        </>
      ) : null}
    </nav>
  );
}
