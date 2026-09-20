"use client";

import { useState } from "react";
import { PackageIcon, SparklesIcon, ChevronRightIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ProfileTestList } from "@/components/profiles/profile-test-list";
import { formatCurrency } from "@/lib/utils/format-currency";
import { formatTat } from "@/lib/utils/format-tat";
import { AVAILABILITY_LABELS, AVAILABILITY_BADGE_VARIANT } from "@/lib/constants/availability";
import { sumMoney, subtractMoney, type Money } from "@/lib/pricing/money";
import type { ProfileSuggestion } from "@/types/profile";
import type { QuotationLineItem } from "@/types/quotation";

// The combined price of the selected tests a package actually matches, minus
// the package's own bundle price — only surfaced when it's genuinely
// cheaper, never a vague "save" claim without real numbers behind it.
function calculateSavings(suggestion: ProfileSuggestion, lineItems: QuotationLineItem[]): Money | null {
  const priceById = new Map(lineItems.map((item) => [item.testId, item.price]));
  const matchedPrices = suggestion.matchedTestIds.map((id) => priceById.get(id));
  if (matchedPrices.length === 0 || matchedPrices.some((price) => !price || price.currency !== suggestion.price.currency)) {
    return null;
  }
  const combined = sumMoney(matchedPrices as Money[], suggestion.price.currency);
  if (combined.amount <= suggestion.price.amount) return null;
  return subtractMoney(combined, suggestion.price);
}

// Package suggestions for the currently selected tests. Rendered in the
// "Find tests" column (see workspace-client.tsx), below the search tabs —
// deliberately minimal: one featured (best-matched) package plus a link to
// see the rest, rather than a list competing with the quotation itself.
export function PackageSuggestions({
  suggestions,
  loading,
  hasSelection,
  lineItems,
}: {
  suggestions: ProfileSuggestion[];
  loading: boolean;
  /** Whether any tests are currently selected — also covers a stale loading/results state left over from before the last test was removed. */
  hasSelection: boolean;
  lineItems: QuotationLineItem[];
}) {
  const [showAll, setShowAll] = useState(false);

  if (!hasSelection || (!loading && suggestions.length === 0)) return null;

  const [top, ...rest] = suggestions;

  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <PackageIcon className="size-3.5" />
        Bundle &amp; save
      </p>

      {loading ? (
        <Skeleton className="h-[62px] w-full rounded-2xl" />
      ) : (
        <>
          <FeaturedPackageCard suggestion={top} savings={calculateSavings(top, lineItems)} />
          {rest.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowAll(true)}
              className="w-full justify-between text-muted-foreground hover:text-foreground"
            >
              See all {suggestions.length} packages
              <ChevronRightIcon className="size-3.5" />
            </Button>
          ) : null}
        </>
      )}

      <Dialog open={showAll} onOpenChange={setShowAll}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>All matching packages</DialogTitle>
            <DialogDescription>
              {suggestions.length} package{suggestions.length === 1 ? "" : "s"} cover at least one of the tests
              you&apos;ve added.
            </DialogDescription>
          </DialogHeader>
          <div className="-mx-1 flex max-h-[65vh] flex-col divide-y divide-border/60 overflow-y-auto px-1">
            {suggestions.map((suggestion) => (
              <div key={suggestion.profileId} className="py-3.5 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-[13.5px] font-semibold">{suggestion.name}</span>
                    <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10.5px]">
                      {suggestion.matchPercentage}% match
                    </Badge>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {formatCurrency(suggestion.price)}
                  </span>
                </div>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  Covers {suggestion.matchedCount}/{suggestion.requestedCount} requested ·{" "}
                  {suggestion.profileTestCount} tests · ready in {formatTat(suggestion.tatText)}
                  {suggestion.availability !== "available"
                    ? ` · ${AVAILABILITY_LABELS[suggestion.availability]}`
                    : ""}
                </p>
                <div className="mt-2.5">
                  <ProfileTestList tests={suggestion.tests} matchedTestIds={new Set(suggestion.matchedTestIds)} />
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// The single best-matched package, called out with its own accent rather
// than blending into a list — this is the one recommendation the agent
// sees without having to open anything.
function FeaturedPackageCard({ suggestion, savings }: { suggestion: ProfileSuggestion; savings: Money | null }) {
  return (
    <div className="group flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/[0.05] px-3.5 py-3 transition-colors hover:border-primary/35 hover:bg-primary/[0.08]">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <SparklesIcon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13.5px] leading-tight font-semibold">{suggestion.name}</span>
          <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10.5px]">
            {suggestion.matchPercentage}% match
          </Badge>
        </div>
        <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
          Covers {suggestion.matchedCount}/{suggestion.requestedCount} selected · {suggestion.profileTestCount} tests
          · ready in {formatTat(suggestion.tatText)}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-sm font-semibold tabular-nums">{formatCurrency(suggestion.price)}</span>
        {savings ? (
          <Badge variant="success" className="px-1.5 py-0 text-[10.5px]">
            Save {formatCurrency(savings)}
          </Badge>
        ) : suggestion.availability !== "available" ? (
          <Badge variant={AVAILABILITY_BADGE_VARIANT[suggestion.availability]} className="px-1.5 py-0 text-[10.5px]">
            {AVAILABILITY_LABELS[suggestion.availability]}
          </Badge>
        ) : null}
      </div>
    </div>
  );
}
