"use client";

import { SparklesIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { TestResultCard } from "./test-result-card";
import { PackageResultRow } from "./package-result-row";
import { SERVICE_TYPE_LABELS, type ServiceType } from "@/lib/constants/service-types";
import type { SearchTestResult } from "@/types/search";
import type { ProfileSearchResult } from "@/types/profile";

export interface SearchResultGroup {
  serviceType: ServiceType;
  tests: SearchTestResult[];
  testsLoading: boolean;
  testsError: string | null;
  profiles: ProfileSearchResult[];
  profilesLoading: boolean;
  /** Closest real name when this service type found nothing — offered, never substituted. */
  didYouMean: string | null;
}

export const resultsTitleClassName = "text-xs font-medium tracking-[0.06em] text-muted-foreground uppercase";

function ResultSkeletons() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-[62px] w-full rounded-xl" />
      <Skeleton className="h-[62px] w-full rounded-xl" />
      <Skeleton className="h-[62px] w-full rounded-xl" />
    </div>
  );
}

// Matched tests and profiles for the current query (the workspace client has
// already left packages out and narrowed to the exact match when there is
// one): tests first, grouped by service type when searching "All" (see
// ServiceTypeFilterSelector), then profiles — in-house only in "All",
// otherwise the selected type's own.
export function SearchResults({
  query,
  browsing = false,
  aiFound = false,
  aiSearching = false,
  exactMatch = false,
  locationName,
  groups,
  showGroupHeaders,
  addedTestIds,
  addedProfileIds,
  onAdd,
  onRemove,
  onAddPackage,
  onRemovePackage,
  onSuggestion,
}: {
  query: string;
  /** Empty query with one service type picked: its full priced list. */
  browsing?: boolean;
  /** The fuzzy search found nothing and these results are Gemini's picks. */
  aiFound?: boolean;
  /** The fuzzy search found nothing and Gemini is being asked. */
  aiSearching?: boolean;
  /** Every result shown matched the query exactly (the lookalikes were left out). */
  exactMatch?: boolean;
  locationName: string | null;
  groups: SearchResultGroup[];
  showGroupHeaders: boolean;
  addedTestIds: Set<string>;
  addedProfileIds: Set<string>;
  onAdd: (result: SearchTestResult) => void;
  onRemove: (testId: string) => void;
  onAddPackage: (result: ProfileSearchResult) => void;
  onRemovePackage: (profileId: string) => void;
  onSuggestion: (text: string) => void;
}) {
  if (!query.trim() && !browsing) {
    return (
      <div className="flex flex-col gap-1.5 px-4 py-14 text-center">
        <p className="text-[15px] font-medium">Search for a test or profile</p>
        <p className="text-[13px] text-muted-foreground">
          Names, codes and the customer&apos;s own words all work — try &ldquo;sugar test&rdquo;. Press{" "}
          <kbd className="rounded border bg-muted px-1 font-mono text-[0.7rem]">/</kbd> to jump to search.
        </p>
      </div>
    );
  }

  const shownProfileGroups = groups.length > 1 ? groups.filter((group) => group.serviceType === "in_house") : groups;
  const anyLoading = groups.some((group) => group.testsLoading || group.profilesLoading);
  const totalCount =
    groups.reduce((sum, group) => sum + group.tests.length, 0) +
    shownProfileGroups.reduce((sum, group) => sum + group.profiles.length, 0);

  // Nothing has come back yet for ANY of the in-flight requests — e.g. the
  // profiles fetch resolved with 0 matches while the (usually slower) tests
  // fetch is still running. Keep showing the skeleton rather than "Nothing
  // found", which would otherwise flash before the test results land.
  if (totalCount === 0 && anyLoading) {
    return (
      <div className="flex flex-col gap-2">
        {aiSearching ? (
          <div className="flex items-center gap-2 px-2 text-[12.5px] text-muted-foreground">
            <SparklesIcon className="size-3.5 animate-pulse text-primary" />
            No close match — searching with AI…
          </div>
        ) : null}
        <ResultSkeletons />
      </div>
    );
  }

  const firstError = groups.find((group) => group.testsError)?.testsError ?? null;
  if (firstError) {
    return <p className="px-2 text-sm text-destructive">{firstError}</p>;
  }

  const didYouMean = groups.find((group) => group.didYouMean)?.didYouMean ?? null;

  if (totalCount === 0 && browsing) {
    return (
      <div className="flex flex-col gap-1.5 px-4 py-14 text-center">
        <p className="text-[15px] font-medium">
          No {SERVICE_TYPE_LABELS[groups[0]?.serviceType ?? "in_house"].toLowerCase()} tests or profiles
          {locationName ? ` at ${locationName}` : ""}
        </p>
      </div>
    );
  }

  if (totalCount === 0) {
    return (
      <div className="flex flex-col gap-1.5 px-4 py-14 text-center">
        <p className="text-[15px] font-medium">No exact match found for &ldquo;{query}&rdquo;</p>
        {didYouMean ? (
          <p className="text-[13.5px]">
            Did you mean{" "}
            <button
              type="button"
              onClick={() => onSuggestion(didYouMean)}
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              {didYouMean}
            </button>
            ?
          </p>
        ) : null}
        <p className="text-[13px] text-muted-foreground">
          Try searching with the test name, abbreviation, or profile name.
        </p>
      </div>
    );
  }

  const nonEmptyGroups = groups.filter((group) => group.testsLoading || group.tests.length > 0);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-2 pt-1 pb-2">
        <span className={resultsTitleClassName}>
          {browsing ? `All ${SERVICE_TYPE_LABELS[groups[0]?.serviceType ?? "in_house"]} · ` : ""}
          {totalCount} {browsing ? "item" : "result"}
          {totalCount === 1 ? "" : "s"}
          {locationName ? ` · ${locationName}` : ""}
        </span>
        {browsing ? null : (
          <span className="text-[11.5px] text-muted-foreground max-md:hidden">
            <kbd className="rounded border bg-muted px-1 font-mono text-[0.7rem]">Enter</kbd> adds the top test
          </span>
        )}
      </div>
      {aiFound ? (
        <div className="flex items-center gap-1.5 px-2 pb-2 text-[12px] text-muted-foreground">
          <SparklesIcon className="size-3.5 text-primary" />
          No close match by name — these were found with AI. Please check before adding.
        </div>
      ) : null}

      {/* Tests for every service type first (in-house, then outsourced),
          then profiles. In "All", only in-house profiles are listed —
          outsourced ones appear when the Outsourced filter is picked. */}
      {nonEmptyGroups.map((group) => (
        <div key={`tests-${group.serviceType}`} className="mb-3 flex flex-col">
          {showGroupHeaders ? (
            <div className="flex items-center gap-2 px-2 pt-1 pb-2 text-[13.5px] font-medium">
              {SERVICE_TYPE_LABELS[group.serviceType]} tests
              <span className="text-xs font-normal text-muted-foreground">{group.tests.length}</span>
            </div>
          ) : null}
          {group.testsLoading ? (
            <Skeleton className="h-[62px] w-full rounded-xl" />
          ) : (
            group.tests.map((result) => (
              <TestResultCard
                key={result.testId}
                result={result}
                added={addedTestIds.has(result.testId)}
                exact={exactMatch}
                onAdd={onAdd}
                onRemove={onRemove}
              />
            ))
          )}
        </div>
      ))}

      {/* Then profiles. */}
      {shownProfileGroups.map((group) =>
        group.profilesLoading ? (
          <Skeleton key={`profiles-${group.serviceType}`} className="mt-1 mb-3 h-[62px] w-full rounded-xl" />
        ) : group.profiles.length > 0 ? (
          <ProfileSection
            key={`profiles-${group.serviceType}`}
            label={`${showGroupHeaders ? `${SERVICE_TYPE_LABELS[group.serviceType]} profiles` : "Profiles"} · ${group.profiles.length}`}
            results={group.profiles}
            addedProfileIds={addedProfileIds}
            exact={exactMatch}
            onAdd={onAddPackage}
            onRemove={onRemovePackage}
          />
        ) : null
      )}
    </div>
  );
}

function ProfileSection({
  label,
  results,
  addedProfileIds,
  exact,
  onAdd,
  onRemove,
}: {
  label: string;
  results: ProfileSearchResult[];
  addedProfileIds: Set<string>;
  exact: boolean;
  onAdd: (result: ProfileSearchResult) => void;
  onRemove: (profileId: string) => void;
}) {
  return (
    <div className="mb-3 flex flex-col gap-2">
      <div className="px-2 pt-2 text-[11px] font-semibold tracking-[0.05em] text-primary/80 uppercase">{label}</div>
      {results.map((result) => (
        <PackageResultRow
          key={result.profileId}
          result={result}
          added={addedProfileIds.has(result.profileId)}
          exact={exact}
          onAdd={onAdd}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}
