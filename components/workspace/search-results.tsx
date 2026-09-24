"use client";

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

// Matched tests + packages for the current query: tests first, grouped by
// service type when searching "All" (see ServiceTypeFilterSelector), then
// packages — in-house only in "All", otherwise the selected type's own.
export function SearchResults({
  query,
  locationName,
  groups,
  showGroupHeaders,
  addedTestIds,
  addedProfileIds,
  onAdd,
  onRemove,
  onAddPackage,
  onRemovePackage,
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

  const shownPackageGroups = groups.length > 1 ? groups.filter((group) => group.serviceType === "in_house") : groups;
  const anyLoading = groups.some((group) => group.testsLoading || group.profilesLoading);
  const totalCount =
    groups.reduce((sum, group) => sum + group.tests.length, 0) +
    shownPackageGroups.reduce((sum, group) => sum + group.profiles.length, 0);

  // Nothing has come back yet for ANY of the in-flight requests — e.g. the
  // profiles fetch resolved with 0 matches while the (usually slower) tests
  // fetch is still running. Keep showing the skeleton rather than "Nothing
  // found", which would otherwise flash before the test results land.
  if (totalCount === 0 && anyLoading) return <ResultSkeletons />;

  const firstError = groups.find((group) => group.testsError)?.testsError ?? null;
  if (firstError) {
    return <p className="px-2 text-sm text-destructive">{firstError}</p>;
  }

  if (totalCount === 0) {
    return (
      <div className="flex flex-col gap-1.5 px-4 py-14 text-center">
        <p className="text-[15px] font-medium">No tests match &ldquo;{query}&rdquo;</p>
        <p className="text-[13px] text-muted-foreground">
          Try a test code, a nickname, or switch to All service types.
        </p>
      </div>
    );
  }

  // With several service types shown ("All"), only in-house packages are
  // listed; a single selected service type shows its own packages.

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

      {shownPackageGroups.map((group) =>
        group.profilesLoading ? (
          <Skeleton key={`packages-${group.serviceType}`} className="mt-1 mb-3 h-[62px] w-full rounded-xl" />
        ) : group.profiles.length > 0 ? (
          <div key={`packages-${group.serviceType}`} className="mb-3 flex flex-col gap-2">
            <div className="px-2 pt-2 text-[11px] font-semibold tracking-[0.05em] text-primary/80 uppercase">
              {showGroupHeaders ? `${SERVICE_TYPE_LABELS[group.serviceType]} packages` : "Packages"} ·{" "}
              {group.profiles.length}
            </div>
            {group.profiles.map((result) => (
              <PackageResultRow
                key={result.profileId}
                result={result}
                added={addedProfileIds.has(result.profileId)}
                onAdd={onAddPackage}
                onRemove={onRemovePackage}
              />
            ))}
          </div>
        ) : null
      )}
    </div>
  );
}
