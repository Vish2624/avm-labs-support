import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Generic route-loading placeholder: a title bar plus a few rows, matching
 * the heading-then-content rhythm every page uses. Rendered by the
 * `loading.tsx` files while a Server Component awaits its data.
 *
 * `padded` adds the page-level `p-6`; the admin sub-pages render inside a
 * layout that already pads, so those pass `padded={false}`.
 */
export function PageSkeleton({
  rows = 6,
  withFilters = false,
  padded = true,
}: {
  rows?: number;
  withFilters?: boolean;
  padded?: boolean;
}) {
  return (
    <div
      className={cn("flex flex-col gap-4", padded && "p-6")}
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>

      {withFilters ? (
        <div className="flex gap-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-8 w-40" />
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
