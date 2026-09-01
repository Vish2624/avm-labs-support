"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Search, LibraryBig, Bell, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types/auth";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
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
        className={cn(
          "flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
            : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
        )}
      >
        <Icon className="size-4" />
        {label}
      </Link>
    );
  };

  return (
    <nav className="flex h-full w-56 shrink-0 flex-col gap-1 border-r bg-sidebar p-3">
      <div className="px-2 py-3 text-sm font-semibold tracking-tight">AVM LABS</div>
      {navItems.map(renderLink)}
      {role === "admin" ? (
        <>
          <div className="mx-2 my-2 border-t border-sidebar-border" />
          <div className="px-2 pb-1 text-xs font-medium uppercase text-sidebar-foreground/50">
            Admin
          </div>
          {renderLink(adminItem)}
        </>
      ) : null}
    </nav>
  );
}
