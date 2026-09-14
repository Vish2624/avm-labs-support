"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { TestResultCard } from "./test-result-card";
import type { SearchTestResult } from "@/types/search";

// List of matched tests for the current query, with loading/empty/error states.
export function SearchResults({
  query,
  results,
  loading,
  error,
  addedTestIds,
  onAdd,
}: {
  query: string;
  results: SearchTestResult[];
  loading: boolean;
  error: string | null;
  addedTestIds: Set<string>;
  onAdd: (result: SearchTestResult) => void;
}) {
  if (!query.trim()) {
    // Also covers a stale loading/error/results state left over from a
    // request that was still in flight when the query got cleared.
    return null;
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (results.length === 0) {
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
    <div className="flex flex-col">
      <p className="mb-1 text-xs text-muted-foreground">
        {results.length} match{results.length === 1 ? "" : "es"} · press{" "}
        <kbd className="rounded border bg-muted px-1 font-mono text-[0.7rem]">Enter</kbd> to add the top one
      </p>
      {results.map((result) => (
        <TestResultCard
          key={result.testId}
          result={result}
          added={addedTestIds.has(result.testId)}
          onAdd={onAdd}
        />
      ))}
    </div>
  );
}
