"use client";

import { useState } from "react";
import { ChevronRightIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ProfileTestList } from "@/components/profiles/profile-test-list";
import { formatCurrency } from "@/lib/utils/format-currency";
import { formatTat } from "@/lib/utils/format-tat";
import type { ProfileSuggestion } from "@/types/profile";
import type { QuotationLineItem } from "@/types/quotation";

// Only the best one on the screen (a pick, else the cheapest profile with the
// quoted tests), the rest behind "See all profiles".
const SHOWN = 1;

const listOf = (names: string[]) =>
  names.length <= 2 ? names.join(" & ") : `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
const testsWord = (n: number) => `${n} more test${n === 1 ? "" : "s"}`;

// The website's wording for a suggestion (matchVM() in its src/logic/04-navigation-cart.js).
function pitchOf(suggestion: ProfileSuggestion, lineItems: QuotationLineItem[]) {
  const w = suggestion.website;
  if (!w) return null;
  const testName = new Map(suggestion.tests.map((t) => [t.testId, t.officialName]));
  const packageName = new Map(lineItems.flatMap((item) => (item.kind === "package" ? [[item.profileId, item.name] as const] : [])));
  const replaced = listOf([
    ...w.replacesProfileIds.map((id) => packageName.get(id) ?? "a profile"),
    ...w.replacesTestIds.map((id) => testName.get(id) ?? "a test"),
  ]);
  const count = w.replacesProfileIds.length + w.replacesTestIds.length;
  const n = w.extraTestIds.length;
  const save = w.extra.amount < 0;
  const free = w.extra.amount === 0;
  const amount = formatCurrency({ ...w.extra, amount: Math.abs(w.extra.amount) });
  return {
    label: !w.pick ? "Has your tests" : w.recommended ? "Featured" : save ? "Saving" : "Profile match",
    headline: save
      ? `Switch & save ${amount}`
      : free
        ? n
          ? `Get ${testsWord(n)} at no extra cost`
          : "Same price, as one profile"
        : `Get ${testsWord(n)} for ${amount} more`,
    detail:
      (save || free
        ? `${suggestion.name} covers ${replaced}${n ? ` — plus ${testsWord(n)}.` : "."}`
        : `${replaced} ${count > 1 ? "are" : "is"} part of ${suggestion.name}. The extra tests are worth ${formatCurrency(w.worth)} on their own.`) +
      (w.freeHomeCollection ? " Home collection becomes free too." : ""),
    pill: save ? `Save ${amount}` : n ? `+${n} test${n === 1 ? "" : "s"}` : "Same price",
    save,
  };
}

const useButtonClassName =
  "h-8 shrink-0 rounded-[9px] bg-primary px-3 text-[13px] font-medium whitespace-nowrap text-primary-foreground transition-[background,translate,scale,box-shadow] duration-200 hover:-translate-y-px hover:shadow-[0_8px_18px_-10px_var(--primary)] active:scale-95";

// "80% match": how much of the quote the profile takes over (the website's cards show the same).
function MatchChip({ percentage }: { percentage: number }) {
  return (
    <span className="rounded-full bg-success/15 px-2 py-px text-[11px] font-semibold whitespace-nowrap text-success-foreground">
      {percentage}% match
    </span>
  );
}

function Pill({ text, save }: { text: string; save: boolean }) {
  return save ? (
    <span className="rounded-full bg-success/15 px-2 py-px text-[11px] font-semibold whitespace-nowrap text-success-foreground">{text}</span>
  ) : (
    <span className="text-[11px] whitespace-nowrap text-muted-foreground">{text}</span>
  );
}

// Profiles to suggest instead of what's on the quote, pinned to the bottom of
// the "Find tests" column, best first, by the website's rules (see
// use-profile-suggestions.ts). Each has a one-click "Use" (swaps what it
// replaces for the profile at its bundle price), and the dialog lists every
// suggestion with why and its full test list, then every other profile
// that contains quoted tests.
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
  /** Whether anything is on the quote — also covers a stale loading/results state left over from before the last item was removed. */
  hasSelection: boolean;
  lineItems: QuotationLineItem[];
  locationName: string | null;
  onUse: (suggestion: ProfileSuggestion) => void;
}) {
  const [showAll, setShowAll] = useState(false);

  if (!hasSelection || (!loading && suggestions.length === 0)) return null;

  const picks = suggestions.filter((suggestion) => suggestion.website?.pick !== false);
  const others = suggestions.filter((suggestion) => suggestion.website?.pick === false);
  const single = lineItems.length === 1;
  const title = picks.length > 0 || loading ? "Better as a profile" : `Profiles with ${single ? "this test" : "these tests"}`;
  const shown = (picks.length > 0 ? picks : others).slice(0, SHOWN);

  function handleUse(suggestion: ProfileSuggestion) {
    setShowAll(false);
    onUse(suggestion);
  }

  return (
    <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-card px-7 pt-3 pb-4">
      <p className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">{title}</p>

      {loading || suggestions.length === 0 ? (
        <Skeleton className="h-[66px] w-full rounded-2xl" />
      ) : (
        <>
          {shown.map((suggestion) => {
            const pitch = pitchOf(suggestion, lineItems);
            return (
              <div
                key={suggestion.profileId}
                className="flex items-center gap-3.5 rounded-[14px] border border-primary/20 bg-primary/[0.04] px-3.5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{suggestion.name}</span>
                    <MatchChip percentage={suggestion.matchPercentage} />
                    {pitch && (
                      <span className="rounded-full bg-primary/10 px-2 py-px text-[11px] font-semibold text-primary">{pitch.label}</span>
                    )}
                  </div>
                  {pitch && <p className="mt-0.5 truncate text-xs text-muted-foreground">{pitch.headline}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-sm font-semibold whitespace-nowrap text-primary tabular-nums">{formatCurrency(suggestion.price)}</span>
                  {pitch && <Pill text={pitch.pill} save={pitch.save} />}
                </div>
                <button type="button" onClick={() => handleUse(suggestion)} className={useButtonClassName}>
                  Use
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="flex h-[34px] items-center justify-between rounded-[9px] px-3 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <span>
              {suggestions.length > SHOWN
                  ? `See all profiles (${suggestions.length})`
                  : "Why, and the tests in it"}
            </span>
            <ChevronRightIcon className="size-3.5" />
          </button>
        </>
      )}

      <Dialog open={showAll} onOpenChange={setShowAll}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {picks.length > 0
                ? "The profiles the website suggests for this quote, best first"
                : `Every profile with ${single ? "this test" : "tests on this quote"}, cheapest first`}
              {locationName ? ` · ${locationName}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="-mx-1 flex max-h-[65vh] flex-col divide-y divide-border/70 overflow-y-auto px-1">
            {suggestions.map((suggestion, index) => {
              const pitch = pitchOf(suggestion, lineItems);
              return (
                <div key={suggestion.profileId} className="flex flex-col gap-2.5 py-4 first:pt-1">
                  {picks.length > 0 && index === picks.length && (
                    <p className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                      Also have tests on this quote
                    </p>
                  )}
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px] font-semibold">{suggestion.name}</span>
                        <MatchChip percentage={suggestion.matchPercentage} />
                        {pitch && (
                          <span className="rounded-full bg-primary/10 px-2 py-px text-[11px] font-semibold text-primary">{pitch.label}</span>
                        )}
                      </div>
                      {pitch && <p className="mt-0.5 text-[13px] font-medium">{pitch.headline}</p>}
                      <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                        {pitch ? `${pitch.detail} ` : ""}Ready in {formatTat(suggestion.tatText)}.
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-sm font-semibold whitespace-nowrap text-primary tabular-nums">{formatCurrency(suggestion.price)}</span>
                      {pitch && <Pill text={pitch.pill} save={pitch.save} />}
                    </div>
                  </div>
                  <ProfileTestList tests={suggestion.tests} matchedTestIds={new Set(suggestion.matchedTestIds)} />
                  <div className="flex justify-end">
                    <button type="button" onClick={() => handleUse(suggestion)} className={useButtonClassName}>
                      Use this profile
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
