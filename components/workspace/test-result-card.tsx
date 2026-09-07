"use client";

import { PlusIcon, CheckIcon, FlaskConicalIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils/format-currency";
import { formatTat } from "@/lib/utils/format-tat";
import { AVAILABILITY_LABELS, AVAILABILITY_BADGE_VARIANT } from "@/lib/constants/availability";
import { SERVICE_TYPE_LABELS } from "@/lib/constants/service-types";
import type { SearchTestResult } from "@/types/search";

// Single test search result row (code, name, price, TAT, availability).
export function TestResultCard({
  result,
  added,
  onAdd,
}: {
  result: SearchTestResult;
  added: boolean;
  onAdd: (result: SearchTestResult) => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-2xl border p-3 transition-all",
        added
          ? "border-primary/25 bg-primary/5"
          : "border-border bg-card hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-elevated"
      )}
    >
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-full transition-colors",
          added ? "bg-primary/15 text-primary" : "bg-accent text-accent-foreground"
        )}
      >
        <FlaskConicalIcon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{result.officialName}</span>
          <Badge variant="outline">{result.code}</Badge>
          {result.matchType === "alias" && result.matchedAlias ? (
            <span className="text-xs text-muted-foreground">via &ldquo;{result.matchedAlias}&rdquo;</span>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="text-sm font-semibold text-foreground tabular-nums">
            {formatCurrency(result.price)}
          </span>
          <span>TAT: {formatTat(result.tatText)}</span>
          <Badge variant={AVAILABILITY_BADGE_VARIANT[result.availability]}>
            {AVAILABILITY_LABELS[result.availability]}
          </Badge>
          <Badge variant="outline">{SERVICE_TYPE_LABELS[result.serviceType]}</Badge>
        </div>
      </div>
      <Button
        type="button"
        size="icon"
        variant={added ? "secondary" : "default"}
        disabled={added}
        aria-label={added ? `${result.officialName} added` : `Add ${result.officialName}`}
        className="shrink-0"
        onClick={() => onAdd(result)}
      >
        {added ? <CheckIcon /> : <PlusIcon />}
      </Button>
    </div>
  );
}
