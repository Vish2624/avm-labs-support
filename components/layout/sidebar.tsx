"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, LibraryBig, Bell, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { SIDEBAR_PANEL_ID } from "./sidebar-portal";
import type { UserRole } from "@/types/auth";

const navItems = [
  { href: "/workspace", label: "Support Workspace", icon: Search },
  { href: "/profiles", label: "Profile Search", icon: LibraryBig },
  { href: "/updates", label: "Updates", icon: Bell },
];

const adminItem = { href: "/admin", label: "Admin", icon: ShieldCheck };

export function Sidebar({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const [filter, setFilter] = useState("");

  const normalizedFilter = filter.trim().toLowerCase();
  const items = navItems.filter((item) => item.label.toLowerCase().includes(normalizedFilter));
  const showAdmin = role === "admin" && adminItem.label.toLowerCase().includes(normalizedFilter);

  const renderLink = ({ href, label, icon: Icon }: (typeof navItems)[number]) => {
    const active = pathname === href || pathname.startsWith(`${href}/`);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-2.5 rounded-full px-3.5 py-2.5 text-sm transition-colors",
          active
            ? "bg-primary text-primary-foreground font-medium shadow-glow"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        )}
      >
        <Icon className="size-4 shrink-0" />
        {label}
      </Link>
    );
  };

  return (
    <nav className="flex h-full w-64 shrink-0 flex-col gap-1 border-r border-sidebar-border bg-sidebar p-3.5 backdrop-blur-md">
      <div className="relative mb-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-sidebar-foreground/40" />
        <input
          type="text"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Search…"
          aria-label="Filter navigation"
          className="h-9 w-full rounded-full border border-sidebar-border bg-sidebar-accent/30 pl-9 pr-3 text-sm text-sidebar-foreground placeholder:text-sidebar-foreground/40 outline-none transition-colors focus-visible:border-sidebar-ring focus-visible:ring-3 focus-visible:ring-sidebar-ring/30"
        />
      </div>
      <div className="mx-1 my-2 border-t border-sidebar-border" />
      {items.map(renderLink)}
      {showAdmin ? (
        <>
          <div className="mx-2 my-2 border-t border-sidebar-border" />
          <div className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-sidebar-foreground/50">
            Admin
          </div>
          {renderLink(adminItem)}
        </>
      ) : null}
      {items.length === 0 && !showAdmin ? (
        <p className="px-3 py-2 text-xs text-sidebar-foreground/40">No matches</p>
      ) : null}
      {/* Fills the rest of the rail — pages with page-specific content for
          here (e.g. the Support Workspace's profile-match suggestions)
          portal it in via SidebarPortal; empty on every other page. */}
      <div id={SIDEBAR_PANEL_ID} className="flex min-h-0 flex-1 flex-col overflow-y-auto" />
    </nav>
  );
}
