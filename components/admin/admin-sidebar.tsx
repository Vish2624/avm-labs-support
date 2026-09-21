"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ADMIN_NAV_ITEMS = [
  { href: "/admin/upload", label: "Upload" },
  { href: "/admin/imports", label: "Import History" },
  { href: "/admin/tests", label: "Tests" },
  { href: "/admin/profiles", label: "Profiles" },
  { href: "/admin/aliases", label: "Aliases" },
  { href: "/admin/availability", label: "Availability" },
  { href: "/admin/export", label: "Export" },
] as const;

// Secondary nav for the Admin section's sub-pages.
export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-1 border-b pb-3">
      {ADMIN_NAV_ITEMS.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-sm transition-colors",
              active
                ? "bg-accent font-medium text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
