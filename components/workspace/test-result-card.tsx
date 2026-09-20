"use client";

import { PlusIcon, CheckIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/format-currency";
import { formatTat } from "@/lib/utils/format-tat";
import { AVAILABILITY_LABELS, AVAILABILITY_BADGE_VARIANT } from "@/lib/constants/availability";
import { Badge } from "@/components/ui/badge";
import type { SearchTestResult } from "@/types/search";

// Single test search result row (code, name, price, TAT, availability).
export function TestResultCard({
  result,
  added,
  onAdd,
  onRemove,
}: {
  result: SearchTestResult;
  added: boolean;
  onAdd: (result: SearchTestResult) => void;
  onRemove: (testId: string) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border-b border-border/60 px-2 py-2.5 transition-colors last:border-b-0 hover:bg-accent/40"
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-[15px] font-semibold">{result.officialName}</span>
          <span className="rounded-[6px] bg-muted px-1.5 py-0.5 text-[11px] font-medium tracking-wide text-muted-foreground">
            {result.code}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] text-muted-foreground">
          <span>Ready in {formatTat(result.tatText)}</span>
          <Badge variant={AVAILABILITY_BADGE_VARIANT[result.availability]}>
            {AVAILABILITY_LABELS[result.availability]}
          </Badge>
          {result.matchType === "alias" && result.matchedAlias ? (
            <span className="text-primary italic">matched &ldquo;{result.matchedAlias}&rdquo;</span>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        <span className="text-[15.5px] font-semibold tabular-nums">{formatCurrency(result.price)}</span>
        {added ? (
          <button
            type="button"
            aria-label={`Remove ${result.officialName}`}
            onClick={() => onRemove(result.testId)}
            className="group/added flex shrink-0 items-center gap-1 rounded-[10px] bg-success/15 px-3 py-1.5 text-xs font-semibold text-success-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
          >
            <span className="group-hover/added:hidden">Added</span>
            <span className="hidden group-hover/added:inline">Remove</span>
            <CheckIcon className="size-3.5 group-hover/added:hidden" />
            <XIcon className="hidden size-3.5 group-hover/added:inline" />
          </button>
        ) : (
          <button
            type="button"
            aria-label={`Add ${result.officialName}`}
            onClick={() => onAdd(result)}
            className="flex shrink-0 items-center gap-1 rounded-[10px] bg-muted px-3.5 py-1.5 text-xs font-semibold text-secondary-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
          >
            <PlusIcon className="size-3.5" /> Add
          </button>
        )}
      </div>
    </div>
  );
}
