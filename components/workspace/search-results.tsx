"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { TestResultCard } from "./test-result-card";
import { ProfileResultCard } from "@/components/profiles/profile-result-card";
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

const sectionLabelClassName = "text-[11px] font-semibold tracking-wide text-muted-foreground uppercase";
const subsectionLabelClassName = "mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground/80 uppercase";

// List of matched tests + profiles for the current query, grouped by
// service type when searching "All" (see ServiceTypeFilterSelector),
// otherwise shown flat since the single active service type is already
// named above the search box.
export function SearchResults({
  query,
  groups,
  showGroupHeaders,
  addedTestIds,
  onAdd,
  onRemove,
}: {
  query: string;
  groups: SearchResultGroup[];
  showGroupHeaders: boolean;
  addedTestIds: Set<string>;
  onAdd: (result: SearchTestResult) => void;
  onRemove: (testId: string) => void;
}) {
  if (!query.trim()) {
    // Also covers a stale loading/error/results state left over from a
    // request that was still in flight when the query got cleared.
    return null;
  }

  const anyLoading = groups.some((group) => group.testsLoading || group.profilesLoading);
  const totalCount = groups.reduce((sum, group) => sum + group.tests.length + group.profiles.length, 0);

  // Nothing has come back yet for ANY of the in-flight requests — e.g. the
  // profiles fetch resolved with 0 matches while the (usually slower) tests
  // fetch is still running. Keep showing the skeleton rather than "Nothing
  // found", which would otherwise flash before the test results land.
  if (totalCount === 0 && anyLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    );
  }

  const firstError = groups.find((group) => group.testsError)?.testsError ?? null;
  if (firstError) {
    return <p className="text-sm text-destructive">{firstError}</p>;
  }

  const nonEmptyGroups = groups.filter(
    (group) => group.testsLoading || group.profilesLoading || group.tests.length > 0 || group.profiles.length > 0
  );

  if (totalCount === 0) {
    return (
      <div className="py-11 text-center leading-relaxed">
        <p className="text-base font-medium">Nothing found for &ldquo;{query}&rdquo;</p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Try the customer&apos;s own words — &ldquo;sugar test&rdquo; and &ldquo;vit d&rdquo; are mapped to
          the right test.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        {totalCount} match{totalCount === 1 ? "" : "es"} · press{" "}
        <kbd className="rounded border bg-muted px-1 font-mono text-[0.7rem]">Enter</kbd> to add the top test
      </p>
      {nonEmptyGroups.map((group) => (
        <div key={group.serviceType} className="flex flex-col gap-2.5">
          {showGroupHeaders ? (
            <p className={sectionLabelClassName}>{SERVICE_TYPE_LABELS[group.serviceType]}</p>
          ) : null}

          {group.testsLoading ? (
            <Skeleton className="h-16 w-full rounded-xl" />
          ) : group.tests.length > 0 ? (
            <div className="flex flex-col">
              {group.profiles.length > 0 || group.profilesLoading ? (
                <p className={subsectionLabelClassName}>Tests</p>
              ) : null}
              {group.tests.map((result) => (
                <TestResultCard
                  key={result.testId}
                  result={result}
                  added={addedTestIds.has(result.testId)}
                  onAdd={onAdd}
                  onRemove={onRemove}
                />
              ))}
            </div>
          ) : null}

          {group.profilesLoading ? (
            <Skeleton className="h-16 w-full rounded-xl" />
          ) : group.profiles.length > 0 ? (
            <div className="flex flex-col">
              {group.tests.length > 0 ? <p className={subsectionLabelClassName}>Packages</p> : null}
              {group.profiles.map((result) => (
                <ProfileResultCard key={result.profileId} result={result} />
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

