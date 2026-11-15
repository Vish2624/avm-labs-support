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
 * What's on the quote (test/profile ids), and the profiles worth suggesting
 * for it — the same ones, in the same order, the website suggests for the
 * same cart (lib/profiles/website-suggestions.ts): ones that replace
 * something on the quote and either cost less or add tests worth more than
 * the difference. A profile already on the quote isn't suggested again.
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

  const key =
    lineItems.length > 0 && locationId
      ? `/api/profiles?${new URLSearchParams({
          suggest: "1",
          testIds: [...addedTestIds].join(","),
          profileIds: [...addedProfileIds].join(","),
          locationId,
        })}`
      : null;
  const { data, isLoading } = useSWR<{ results: ProfileSuggestion[] }>(key, fetcher);

  const suggestions = useMemo(
    () => (data?.results ?? EMPTY_PROFILE_SUGGESTIONS).filter((suggestion) => !addedProfileIds.has(suggestion.profileId)),
    [data, addedProfileIds]
  );

  return { addedTestIds, addedProfileIds, suggestions, loading: isLoading };
}
