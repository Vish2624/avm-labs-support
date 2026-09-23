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
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.06em] text-primary uppercase">
          Admin panel · only admins can see this
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Price lists &amp; catalog</h1>
      </div>
    <nav className="flex w-fit flex-wrap gap-0.5 rounded-[10px] bg-muted p-[3px]">
      {ADMIN_NAV_ITEMS.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex h-[30px] items-center rounded-lg px-3 text-[13px] font-medium transition-colors",
              active
                ? "bg-card text-foreground shadow-[0_1px_2px_oklch(0.2_0.02_258/0.12)]"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
    </div>
  );
}
