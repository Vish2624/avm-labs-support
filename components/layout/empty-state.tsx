import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * What a list shows when it has nothing: an icon, a short title, one line on
 * why or what to do next, and optionally a link to the place that fixes it
 * (e.g. "Upload a price list"). Shared so every empty list reads the same.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; href: string };
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-2 px-6 py-10 text-center avm-fade-up", className)}>
      <span className="mb-1 grid size-11 place-items-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="text-[15px] font-medium text-foreground">{title}</p>
      {description ? <p className="max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? (
        <Link href={action.href} className={cn(buttonVariants({ size: "sm" }), "mt-2")}>
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
