"use client";

import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/format-currency";
import { formatTat } from "@/lib/utils/format-tat";
import { AVAILABILITY_LABELS } from "@/lib/constants/availability";
import { AvailabilityPill } from "./availability-pill";
import type { SearchTestResult } from "@/types/search";

// Fixed-width Add / Added toggle shared by test and package result rows, so
// prices line up in one column regardless of which state a row is in.
export function AddToggleButton({
  added,
  label,
  onAdd,
  onRemove,
}: {
  added: boolean;
  label: string;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return added ? (
    <button
      type="button"
      aria-label={`Remove ${label}`}
      onClick={onRemove}
      className="group/added h-[34px] w-[84px] shrink-0 rounded-[10px] bg-success/15 text-[13px] font-medium text-success-foreground transition-[background,color,scale] duration-200 avm-added hover:bg-destructive/10 hover:text-destructive active:scale-95"
    >
      <span className="inline-block group-hover/added:hidden avm-check">Added ✓</span>
      <span className="hidden group-hover/added:inline-block group-hover/added:avm-fade-in">Remove</span>
    </button>
  ) : (
    <button
      type="button"
      aria-label={`Add ${label}`}
      onClick={onAdd}
      className="h-[34px] w-[84px] shrink-0 rounded-[10px] bg-primary/10 text-[13px] font-medium text-primary transition-[background,color,transform,translate,scale,rotate,box-shadow] duration-200 avm-fade-in hover:scale-[1.04] hover:bg-primary hover:text-primary-foreground hover:shadow-[0_6px_16px_-8px_var(--primary)] active:scale-95 dark:bg-primary/15"
    >
      + Add
    </button>
  );
}

// Single test search result row (name, code, TAT, availability, price, add).
export function TestResultCard({
  result,
  added,
  onAdd,
  onRemove,
  index = 0,
}: {
  result: SearchTestResult;
  added: boolean;
  onAdd: (result: SearchTestResult) => void;
  onRemove: (testId: string) => void;
  /** Position in the list — staggers the rows' entrance. */
  index?: number;
}) {
  const showAlias =
    result.matchType === "alias" &&
    result.matchedAlias &&
    !result.officialName.toLowerCase().includes(result.matchedAlias.toLowerCase());

  return (
    <div
      className={cn(
        "relative flex items-center gap-3.5 rounded-[14px] border border-transparent px-3 py-[13px] avm-row-in",
        "transition-[background,border-color,transform,translate,scale,rotate,box-shadow] duration-300 hover:-translate-y-px hover:border-border hover:bg-card hover:shadow-elevated",
        result.availability === "unavailable" && "opacity-60"
      )}
      style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}
    >
      {added ? <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[14px] avm-flash" /> : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-medium">{result.officialName}</span>
          <span className="rounded-[5px] bg-muted px-1.5 py-px font-mono text-[11px] text-muted-foreground">
            {result.code}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 text-[12.5px] text-muted-foreground">
          <span className="whitespace-nowrap">Ready in {formatTat(result.tatText)}</span>
          <AvailabilityPill status={result.availability} />
          {showAlias ? <span className="text-primary">matched &ldquo;{result.matchedAlias}&rdquo;</span> : null}
        </div>
      </div>
      <span
        className={cn(
          "shrink-0 text-[15px] font-semibold whitespace-nowrap tabular-nums",
          // In-house prices in blue, outsourced in red.
          result.serviceType === "outsource" ? "text-[oklch(0.55_0.2_25)] dark:text-[oklch(0.72_0.17_25)]" : "text-primary"
        )}
        title={AVAILABILITY_LABELS[result.availability]}
      >
        {formatCurrency(result.price)}
      </span>
      <AddToggleButton
        added={added}
        label={result.officialName}
        onAdd={() => onAdd(result)}
        onRemove={() => onRemove(result.testId)}
      />
    </div>
  );
}
