"use client";

import { SparklesIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { TestResultCard } from "./test-result-card";
import { PackageResultRow } from "./package-result-row";
import { SERVICE_TYPE_LABELS, type ServiceType } from "@/lib/constants/service-types";
import type { SearchTestResult } from "@/types/search";
import type { ProfileSearchResult } from "@/types/profile";
import type { SemanticSearchItem } from "@/lib/search/semantic-search-results";
import type { SemanticSearchState } from "./use-semantic-search";

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

/** A package's own name must match at least this well (0-100) to be listed above the tests. */
const BEST_PACKAGE_SCORE = 90;

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

// Matched tests + packages for the current query: packages whose own name
// strongly matches first (unless a test matched exactly), then tests
// grouped by service type when searching "All" (see
// ServiceTypeFilterSelector), then the remaining packages — in-house only
// in "All", otherwise the selected type's own.
export function SearchResults({
  query,
  locationName,
  groups: allGroups,
  showGroupHeaders,
  addedTestIds,
  addedProfileIds,
  onAdd,
  onRemove,
  onAddPackage,
  onRemovePackage,
  onSuggestion,
  ai,
}: {
  query: string;
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
  ai: SemanticSearchState | null;
}) {
  if (!query.trim()) {
    return (
      <div className="flex flex-col gap-1.5 px-4 py-14 text-center">
        <p className="text-[15px] font-medium">Search for a test or package</p>
        <p className="text-[13px] text-muted-foreground">
          Names, codes and the customer&apos;s own words all work — try &ldquo;sugar test&rdquo;. Press{" "}
          <kbd className="rounded border bg-muted px-1 font-mono text-[0.7rem]">/</kbd> to jump to search.
        </p>
      </div>
    );
  }

  // Items the AI section already shows aren't repeated in the lists below.
  const aiItems = ai?.items ?? [];
  const aiIds = new Set(aiItems.map((item) => (item.kind === "test" ? item.result.testId : item.result.profileId)));
  const groups = allGroups.map((group) => ({
    ...group,
    tests: group.tests.filter((result) => !aiIds.has(result.testId)),
    profiles: group.profiles.filter((result) => !aiIds.has(result.profileId)),
  }));

  const shownPackageGroups = groups.length > 1 ? groups.filter((group) => group.serviceType === "in_house") : groups;
  const anyLoading = groups.some((group) => group.testsLoading || group.profilesLoading);
  const totalCount =
    aiItems.length +
    groups.reduce((sum, group) => sum + group.tests.length, 0) +
    shownPackageGroups.reduce((sum, group) => sum + group.profiles.length, 0);

  // Nothing has come back yet for ANY of the in-flight requests — e.g. the
  // profiles fetch resolved with 0 matches while the (usually slower) tests
  // fetch is still running. Keep showing the skeleton rather than "Nothing
  // found", which would otherwise flash before the test results land.
  if (totalCount === 0 && (anyLoading || ai?.loading)) {
    return (
      <div className="flex flex-col gap-2">
        {ai?.loading ? <AiLoadingHint preparing={ai.preparing} /> : null}
        <ResultSkeletons />
      </div>
    );
  }

  const firstError = groups.find((group) => group.testsError)?.testsError ?? null;
  if (firstError) {
    return <p className="px-2 text-sm text-destructive">{firstError}</p>;
  }

  const didYouMean = groups.find((group) => group.didYouMean)?.didYouMean ?? null;

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

  // With several service types shown ("All"), only in-house packages are
  // listed; a single selected service type shows its own packages.

  // A package whose own name/code strongly matches ("thyroid profile",
  // "lipid") leads when no test matched exactly; packages that merely
  // contain the searched test stay after the tests.
  const anyExactTest = groups.some((group) => group.tests.some((result) => result.matchType === "exact"));
  const bestPackages = anyExactTest
    ? []
    : shownPackageGroups.flatMap((group) =>
        group.profiles.filter((result) => (result.nameScore ?? 0) >= BEST_PACKAGE_SCORE)
      );
  const bestPackageIds = new Set(bestPackages.map((result) => result.profileId));

  const nonEmptyGroups = groups.filter(
    (group) => group.testsLoading || group.profilesLoading || group.tests.length > 0 || group.profiles.length > 0
  );

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-2 pt-1 pb-2">
        <span className={resultsTitleClassName}>
          {totalCount} result{totalCount === 1 ? "" : "s"}
          {locationName ? ` · ${locationName}` : ""}
        </span>
        <span className="text-[11.5px] text-muted-foreground">
          <kbd className="rounded border bg-muted px-1 font-mono text-[0.7rem]">Enter</kbd> adds the top test
        </span>
      </div>
      {ai && (ai.loading || aiItems.length > 0) ? (
        <AiSection
          ai={ai}
          addedTestIds={addedTestIds}
          addedProfileIds={addedProfileIds}
          onAdd={onAdd}
          onRemove={onRemove}
          onAddPackage={onAddPackage}
          onRemovePackage={onRemovePackage}
        />
      ) : null}

      {bestPackages.length > 0 ? (
        <PackageSection
          label={`Best matching package${bestPackages.length === 1 ? "" : "s"}`}
          results={bestPackages}
          addedProfileIds={addedProfileIds}
          onAdd={onAddPackage}
          onRemove={onRemovePackage}
        />
      ) : null}

      {/* Tests for every service type first (in-house, then outsourced),
          then packages. In "All", only in-house packages are listed —
          outsourced ones appear when the Outsourced filter is picked. */}
      {nonEmptyGroups.map((group) =>
        group.testsLoading || group.tests.length > 0 ? (
          <div key={`tests-${group.serviceType}`} className="mb-3 flex flex-col">
            {showGroupHeaders ? (
              <div className="flex items-center gap-2 px-2 pt-2 pb-1.5 text-xs font-medium text-muted-foreground">
                {SERVICE_TYPE_LABELS[group.serviceType]} tests
                <span className="font-normal text-muted-foreground/70">{group.tests.length}</span>
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
                  onAdd={onAdd}
                  onRemove={onRemove}
                />
              ))
            )}
          </div>
        ) : null
      )}

      {shownPackageGroups.map((group) => {
        const rest = group.profiles.filter((result) => !bestPackageIds.has(result.profileId));
        return group.profilesLoading ? (
          <Skeleton key={`packages-${group.serviceType}`} className="mt-1 mb-3 h-[62px] w-full rounded-xl" />
        ) : rest.length > 0 ? (
          <PackageSection
            key={`packages-${group.serviceType}`}
            label={`${showGroupHeaders ? `${SERVICE_TYPE_LABELS[group.serviceType]} packages` : "Packages"} · ${rest.length}`}
            results={rest}
            addedProfileIds={addedProfileIds}
            onAdd={onAddPackage}
            onRemove={onRemovePackage}
          />
        ) : null;
      })}
    </div>
  );
}

function PackageSection({
  label,
  results,
  addedProfileIds,
  onAdd,
  onRemove,
}: {
  label: string;
  results: ProfileSearchResult[];
  addedProfileIds: Set<string>;
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
          onAdd={onAdd}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}

function AiLoadingHint({ preparing }: { preparing: boolean }) {
  return (
    <div className="flex items-center gap-2 px-2 text-[12.5px] text-muted-foreground">
      <SparklesIcon className="size-3.5 animate-pulse text-primary" />
      {preparing ? "Getting AI search ready (first time on this computer only)…" : "Finding related tests with AI…"}
    </div>
  );
}

// The in-browser AI's picks, best first. Only real catalog items priced
// here ever reach this list (see lib/search/semantic-search-results.ts).
function AiSection({
  ai,
  addedTestIds,
  addedProfileIds,
  onAdd,
  onRemove,
  onAddPackage,
  onRemovePackage,
}: {
  ai: SemanticSearchState;
  addedTestIds: Set<string>;
  addedProfileIds: Set<string>;
  onAdd: (result: SearchTestResult) => void;
  onRemove: (testId: string) => void;
  onAddPackage: (result: ProfileSearchResult) => void;
  onRemovePackage: (profileId: string) => void;
}) {
  if (ai.loading) {
    return (
      <div className="mb-3 flex flex-col gap-2">
        <AiLoadingHint preparing={ai.preparing} />
      </div>
    );
  }
  const confident = ai.items.filter((item) => item.confidence === "high");
  const possible = ai.items.filter((item) => item.confidence === "low");

  const renderItem = (item: SemanticSearchItem) =>
    item.kind === "test" ? (
      <TestResultCard
        key={item.result.testId}
        result={item.result}
        added={addedTestIds.has(item.result.testId)}
        onAdd={onAdd}
        onRemove={onRemove}
      />
    ) : (
      <PackageResultRow
        key={item.result.profileId}
        result={item.result}
        added={addedProfileIds.has(item.result.profileId)}
        onAdd={onAddPackage}
        onRemove={onRemovePackage}
      />
    );

  return (
    <div className="mb-3 flex flex-col gap-2 rounded-2xl border border-primary/15 bg-primary/[0.025] p-2 dark:bg-primary/[0.05]">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-1.5 pt-1 text-[11px] font-semibold tracking-[0.05em] text-primary/80 uppercase">
        <SparklesIcon className="size-3.5" />
        {confident.length > 0 ? "AI best match" : "No exact match found — possible matches"}
      </div>
      {confident.map(renderItem)}
      {confident.length > 0 && possible.length > 0 ? (
        <div className="px-1.5 pt-1 text-[11px] font-medium text-muted-foreground">Possible matches</div>
      ) : null}
      {possible.map(renderItem)}
    </div>
  );
}
