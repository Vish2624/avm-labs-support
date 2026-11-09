"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/utils/fetcher";
import type { ProfileSuggestion } from "@/types/profile";
import type { QuotationLineItem } from "@/types/quotation";

// Stable reference so a missing SWR response doesn't create a new empty
// array every render — that would retrigger effects keyed on it.
const EMPTY_PROFILE_SUGGESTIONS: ProfileSuggestion[] = [];

/**
 * From profiles already ranked by match (best first): the top match, plus
 * the cheapest profile among those covering the most selected tests when
 * that's a different one. Same-currency prices only (they all come from one
 * location + service type).
 */
function pickTopAndCheapest(ranked: ProfileSuggestion[]): ProfileSuggestion[] {
  const [top] = ranked;
  if (!top) return EMPTY_PROFILE_SUGGESTIONS;
  const bestCoverage = Math.max(...ranked.map((suggestion) => suggestion.matchedCount));
  const cheapest = ranked
    .filter((suggestion) => suggestion.matchedCount === bestCoverage)
    .reduce((low, suggestion) => (suggestion.price.amount < low.price.amount ? suggestion : low));
  return cheapest.profileId === top.profileId ? [top] : [top, cheapest];
}

/**
 * What's on the quote (test/profile ids), and the profiles/packages worth
 * suggesting for it: only ones containing EVERYTHING on the quote — its
 * tests and the tests inside its profiles/packages (one missing even a
 * single requested test is never suggested). Just two: the tightest fit
 * (fewest extra tests) and the cheapest. One already on the quote isn't
 * suggested again.
 *
 * Only meaningful when everything on the quote shares one real service type
 * (a package has one service type too, so there's no single sensible
 * comparison once in-house and outsourced mix).
 */
export function useProfileSuggestions(lineItems: QuotationLineItem[], locationId: string) {
  const addedTestIds = useMemo(
    () => new Set(lineItems.flatMap((item) => (item.kind === "test" ? [item.testId] : []))),
    [lineItems]
  );
  const addedProfileIds = useMemo(
    () => new Set(lineItems.flatMap((item) => (item.kind === "package" ? [item.profileId] : []))),
    [lineItems]
  );
  const requestedTestIds = useMemo(
    () => [...new Set(lineItems.flatMap((item) => (item.kind === "test" ? [item.testId] : item.tests.map((t) => t.testId))))],
    [lineItems]
  );

  const serviceTypes = new Set(lineItems.map((item) => item.serviceType));
  const uniformServiceType = serviceTypes.size === 1 ? [...serviceTypes][0] : null;
  const key =
    requestedTestIds.length > 0 && locationId && uniformServiceType
      ? `/api/profiles?${new URLSearchParams({ testIds: requestedTestIds.join(","), locationId, serviceType: uniformServiceType })}`
      : null;
  const { data, isLoading } = useSWR<{ results: ProfileSuggestion[] }>(key, fetcher);

  const suggestions = useMemo(
    () =>
      pickTopAndCheapest(
        (data?.results ?? EMPTY_PROFILE_SUGGESTIONS).filter(
          (suggestion) =>
            !addedProfileIds.has(suggestion.profileId) &&
            suggestion.requestedCount === requestedTestIds.length &&
            suggestion.matchedCount === suggestion.requestedCount
        )
      ),
    [data, addedProfileIds, requestedTestIds]
  );

  return { addedTestIds, addedProfileIds, suggestions, loading: isLoading };
}
