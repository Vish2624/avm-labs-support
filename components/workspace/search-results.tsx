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
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (results.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No tests matched &ldquo;{query}&rdquo; at this location and service type.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        {results.length} match{results.length === 1 ? "" : "es"} · press{" "}
        <kbd className="rounded border bg-muted px-1 font-mono text-[0.7rem]">Enter</kbd> to add the top one
      </p>
      <div className="flex max-h-[30rem] flex-col gap-2 overflow-y-auto pr-1">
        {results.map((result) => (
          <TestResultCard
            key={result.testId}
            result={result}
            added={addedTestIds.has(result.testId)}
            onAdd={onAdd}
          />
        ))}
      </div>
    </div>
  );
}
