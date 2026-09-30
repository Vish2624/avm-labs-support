"use client";

import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/format-currency";
import { sumMoney } from "@/lib/pricing/money";
import { EXACT_MATCH_ROW_CLASS, ExactMatchTag } from "./test-result-card";
import type { CalculatedSearchResult, SearchTestResult } from "@/types/search";
import type { ProfileSearchResult } from "@/types/profile";

/** Whether a calculated parameter can be quoted here: its profile is offered, or it has tests to add. */
export function calculatedIsOrderable(result: CalculatedSearchResult): boolean {
  return result.viaProfileCode ? result.viaProfile !== null : result.sources.length > 0;
}

// A calculated parameter (e.g. Serum Globulin) matched in the Quote search.
// It has no price of its own: the card says what it's calculated from and
// adds the tests to order — the ones not already on the quote — in one click.
// One that's only done as part of a profile (eGFR -> Kidney Function Test)
// offers that whole profile instead.
export function CalculatedResultCard({
  result,
  addedTestIds,
  addedProfileIds,
  onAddMany,
  onAddPackage,
  exact = false,
}: {
  result: CalculatedSearchResult;
  addedTestIds: Set<string>;
  addedProfileIds: Set<string>;
  onAddMany: (results: SearchTestResult[]) => void;
  onAddPackage: (result: ProfileSearchResult) => void;
  /** The search matched this parameter's name exactly — shown with a green border. */
  exact?: boolean;
}) {
  const profile = result.viaProfile;
  const toAdd = result.sources.filter((source) => !addedTestIds.has(source.testId));
  const currency = result.sources[0]?.price.currency;
  const total = result.viaProfileCode
    ? (profile?.price ?? null)
    : currency
      ? sumMoney(result.sources.map((source) => source.price), currency)
      : null;
  const orderNames = result.sources.map((source) => source.officialName);
  // Only spelled out when it differs from "calculated from" (a source that is itself calculated was expanded).
  const orderDiffers = orderNames.join("|") !== result.sourceNames.join("|");

  return (
    <div
      className={cn(
        "relative rounded-[14px] border border-dashed border-primary/30 px-3 py-3 avm-row-quick dark:border-primary/35",
        exact && EXACT_MATCH_ROW_CLASS
      )}
    >
      <div className="flex items-center gap-3.5 max-md:flex-wrap max-md:gap-x-3 max-md:gap-y-2.5">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 max-md:basis-full">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-medium">{result.officialName}</span>
            <span className="rounded-[5px] bg-muted px-1.5 py-px text-[10.5px] font-semibold tracking-[0.03em] text-muted-foreground">
              CALCULATED
            </span>
            {exact ? <ExactMatchTag /> : null}
          </div>
          <span className="text-[12.5px] text-muted-foreground">
            Calculated from <span className="font-medium text-foreground">{result.sourceNames.join(" + ")}</span>
          </span>
          {result.viaProfileCode ? (
            profile ? (
              <span className="text-[12.5px] text-muted-foreground">
                Only done as part of the <span className="font-medium text-foreground">{profile.name}</span>
              </span>
            ) : (
              <span className="text-[12.5px] text-[oklch(0.55_0.15_60)] dark:text-[oklch(0.8_0.13_75)]">
                Only done as part of profile {result.viaProfileCode}, which isn&apos;t offered here
              </span>
            )
          ) : orderDiffers && orderNames.length > 0 ? (
            <span className="text-[12.5px] text-muted-foreground">
              Order: <span className="font-medium text-foreground">{orderNames.join(" + ")}</span>
            </span>
          ) : null}
          {!result.viaProfileCode && result.unpricedSources.length > 0 ? (
            <span className="text-[12.5px] text-[oklch(0.55_0.15_60)] dark:text-[oklch(0.8_0.13_75)]">
              Not in the price list: {result.unpricedSources.join(", ")}
            </span>
          ) : null}
          {result.description ? <span className="text-[12.5px] text-muted-foreground">{result.description}</span> : null}
        </div>
        {total ? (
          <span className="shrink-0 text-[15px] font-semibold whitespace-nowrap text-primary tabular-nums max-md:ml-auto">
            {formatCurrency(total)}
          </span>
        ) : null}
        {result.viaProfileCode ? (
          profile ? (
            addedProfileIds.has(profile.profileId) ? (
              <span className="grid h-[34px] shrink-0 place-items-center rounded-[10px] bg-success/15 px-3 text-[13px] font-medium text-success-foreground">
                Added ✓
              </span>
            ) : (
              <button
                type="button"
                aria-label={`Add ${profile.name}`}
                onClick={() => onAddPackage(profile)}
                className="h-[34px] shrink-0 rounded-[10px] bg-primary/10 px-3 text-[13px] font-medium whitespace-nowrap text-primary transition-[background,color,scale] duration-200 hover:bg-primary hover:text-primary-foreground active:scale-95 dark:bg-primary/15"
              >
                + Add {profile.name}
              </button>
            )
          ) : null
        ) : result.sources.length === 0 ? null : toAdd.length === 0 ? (
          <span className="grid h-[34px] w-[84px] shrink-0 place-items-center rounded-[10px] bg-success/15 text-[13px] font-medium text-success-foreground">
            Added ✓
          </span>
        ) : (
          <button
            type="button"
            aria-label={`Add the tests for ${result.officialName}`}
            onClick={() => onAddMany(toAdd)}
            className="h-[34px] shrink-0 rounded-[10px] bg-primary/10 px-3 text-[13px] font-medium whitespace-nowrap text-primary transition-[background,color,scale] duration-200 hover:bg-primary hover:text-primary-foreground active:scale-95 dark:bg-primary/15"
          >
            + Add {toAdd.length} test{toAdd.length === 1 ? "" : "s"}
          </button>
        )}
      </div>
    </div>
  );
}
