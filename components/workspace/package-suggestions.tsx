"use client";

import { useState } from "react";
import { ChevronRightIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ProfileTestList } from "@/components/profiles/profile-test-list";
import { AvailabilityPill } from "./availability-pill";
import { formatCurrency } from "@/lib/utils/format-currency";
import { formatTat } from "@/lib/utils/format-tat";
import { sumMoney, subtractMoney, type Money } from "@/lib/pricing/money";
import type { ProfileSuggestion } from "@/types/profile";
import type { QuotationLineItem } from "@/types/quotation";

// The combined price of the selected tests a package actually matches, minus
// the package's own bundle price — only surfaced when it's genuinely
// cheaper, never a vague "save" claim without real numbers behind it.
function calculateSavings(suggestion: ProfileSuggestion, lineItems: QuotationLineItem[]): Money | null {
  const priceById = new Map(
    lineItems.flatMap((item) => (item.kind === "test" ? [[item.testId, item.price] as const] : []))
  );
  const matchedPrices = suggestion.matchedTestIds.map((id) => priceById.get(id));
  if (matchedPrices.length === 0 || matchedPrices.some((price) => !price || price.currency !== suggestion.price.currency)) {
    return null;
  }
  const combined = sumMoney(matchedPrices as Money[], suggestion.price.currency);
  if (combined.amount <= suggestion.price.amount) return null;
  return subtractMoney(combined, suggestion.price);
}

function coversLabel(suggestion: ProfileSuggestion): string {
  return `Covers ${suggestion.matchedCount}/${suggestion.requestedCount} selected · ${suggestion.profileTestCount} tests · ready in ${formatTat(suggestion.tatText)}`;
}

function PriceAndSavings({ suggestion, savings }: { suggestion: ProfileSuggestion; savings: Money | null }) {
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <span className="text-sm font-semibold whitespace-nowrap text-primary tabular-nums">{formatCurrency(suggestion.price)}</span>
      {savings ? (
        <span className="rounded-full bg-success/15 px-2 py-px text-[11px] font-semibold whitespace-nowrap text-success-foreground">
          Save {formatCurrency(savings)}
        </span>
      ) : suggestion.availability !== "available" ? (
        <AvailabilityPill status={suggestion.availability} className="text-[11px]" />
      ) : null}
    </div>
  );
}

const useButtonClassName =
  "h-8 shrink-0 rounded-[9px] bg-primary px-3 text-[13px] font-medium whitespace-nowrap text-primary-foreground transition-colors hover:bg-primary/90";

// Packages covering the tests on the quote, pinned to the bottom of the
// "Find tests" column: the best match with a one-click "Use" (swaps the
// tests it covers for the package at its fixed bundle price), plus a
// dialog listing every match.
export function PackageSuggestions({
  suggestions,
  loading,
  hasSelection,
  lineItems,
  locationName,
  onUse,
}: {
  suggestions: ProfileSuggestion[];
  loading: boolean;
  /** Whether any tests are currently selected — also covers a stale loading/results state left over from before the last test was removed. */
  hasSelection: boolean;
  lineItems: QuotationLineItem[];
  locationName: string | null;
  onUse: (suggestion: ProfileSuggestion) => void;
}) {
  const [showAll, setShowAll] = useState(false);

  if (!hasSelection || (!loading && suggestions.length === 0)) return null;

  const [top] = suggestions;

  function handleUse(suggestion: ProfileSuggestion) {
    setShowAll(false);
    onUse(suggestion);
  }

  return (
    <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-card px-7 pt-3 pb-4">
      <p className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Matching packages</p>

      {loading || !top ? (
        <Skeleton className="h-[66px] w-full rounded-2xl" />
      ) : (
        <>
          <div className="flex items-center gap-3.5 rounded-[14px] border border-primary/20 bg-primary/[0.04] px-3.5 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{top.name}</span>
                <span className="rounded-full border border-border bg-card px-2 py-px text-[11px] font-medium text-muted-foreground">
                  {top.matchPercentage}% match
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{coversLabel(top)}</p>
            </div>
            <PriceAndSavings suggestion={top} savings={calculateSavings(top, lineItems)} />
            <button type="button" onClick={() => handleUse(top)} className={useButtonClassName}>
              Use
            </button>
          </div>
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="flex h-[34px] items-center justify-between rounded-[9px] px-3 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <span>
              {suggestions.length === 1 ? "View package details" : `See all ${suggestions.length} matching packages`}
            </span>
            <ChevronRightIcon className="size-3.5" />
          </button>
        </>
      )}

      <Dialog open={showAll} onOpenChange={setShowAll}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>All matching packages</DialogTitle>
            <DialogDescription>
              {suggestions.length} package{suggestions.length === 1 ? " includes" : "s include"} at least one test
              you&apos;ve added{locationName ? ` · ${locationName}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="-mx-1 flex max-h-[65vh] flex-col divide-y divide-border/70 overflow-y-auto px-1">
            {suggestions.map((suggestion, index) => (
              <div key={suggestion.profileId} className="flex flex-col gap-2.5 py-4 first:pt-1">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-semibold">{suggestion.name}</span>
                      <span className="rounded-full bg-muted px-2 py-px text-[11px] font-medium text-muted-foreground">
                        {suggestion.matchPercentage}% match
                      </span>
                      {index === 0 ? (
                        <span className="rounded-full bg-primary/10 px-2 py-px text-[11px] font-semibold text-primary">
                          Best match
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[12.5px] text-muted-foreground">{coversLabel(suggestion)}</p>
                  </div>
                  <PriceAndSavings suggestion={suggestion} savings={calculateSavings(suggestion, lineItems)} />
                </div>
                <ProfileTestList tests={suggestion.tests} matchedTestIds={new Set(suggestion.matchedTestIds)} />
                <div className="flex justify-end">
                  <button type="button" onClick={() => handleUse(suggestion)} className={useButtonClassName}>
                    Use this package
                  </button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
