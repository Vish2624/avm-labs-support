import { cn } from "@/lib/utils";

/**
 * Standard page title block — a heading, an optional one-line description,
 * and an optional right-aligned slot for controls (selectors, actions).
 * Every top-level page uses this so the header rhythm stays identical.
 */
export function PageHeader({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 avm-fade-up", className)}>
      <div className="min-w-0">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">{title}</h1>
        {description ? (
          <p className="mt-1 text-[14.5px] text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children ? <div className="flex items-center gap-2">{children}</div> : null}
    </div>
  );
}
