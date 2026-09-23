"use client";

import { useEffect, useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { TestResultCard } from "./test-result-card";
import { resultsTitleClassName } from "./search-results";
import { fetcher } from "@/lib/utils/fetcher";
import type { ServiceType } from "@/lib/constants/service-types";
import type { SearchTestResult } from "@/types/search";

// Splits a pasted customer message into candidate test-name tokens — the
// same separators the search box's underlying alias/fuzzy matcher is built
// to tolerate, just applied to a whole message instead of one query.
const SPLIT_PATTERN = /[,\n;/?.!]+|\band\b|\bplus\b|\balso\b/i;
const EXTRACT_DEBOUNCE_MS = 600;
// One /api/search request per token — cap it so a very long pasted message
// can't fire an unbounded burst of requests.
const MAX_TOKENS = 15;

function tokenize(text: string): string[] {
  return [
    ...new Set(
      text
        .split(SPLIT_PATTERN)
        .map((token) => token.trim().toLowerCase())
        .filter((token) => token.length >= 2)
    ),
  ].slice(0, MAX_TOKENS);
}

/**
 * Reads test mentions out of a customer's raw message as the agent pastes
 * it, by running each token through the exact same searchTests() pipeline
 * as the search box (via /api/search) and keeping only the top match per
 * token — never a guess, only real alias/catalog matches with a current
 * price at this location + service type.
 */
export function useMessageExtraction(text: string, locationId: string, serviceType: ServiceType) {
  // Results are stored with the request they answer, so "loading" can be
  // derived (does the stored result match the current input?) instead of
  // being reset inside the effect.
  const [result, setResult] = useState<{ key: string; detected: SearchTestResult[] } | null>(null);

  const tokens = useMemo(() => tokenize(text), [text]);
  const key = tokens.length > 0 && locationId ? JSON.stringify([tokens, locationId, serviceType]) : null;

  useEffect(() => {
    if (!key) return;

    let cancelled = false;
    const timeout = setTimeout(async () => {
      const responses = await Promise.all(
        tokens.map((token) =>
          fetcher<{ results: SearchTestResult[] }>(
            `/api/search?${new URLSearchParams({ q: token, locationId, serviceType })}`
          ).catch(() => ({ results: [] as SearchTestResult[] }))
        )
      );
      if (cancelled) return;
      const found: SearchTestResult[] = [];
      for (const response of responses) {
        const top = response.results[0];
        if (top && !found.some((existing) => existing.testId === top.testId)) found.push(top);
      }
      setResult({ key, detected: found });
    }, EXTRACT_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [key, tokens, locationId, serviceType]);

  if (!key) return { detected: [] as SearchTestResult[], loading: false };
  // While a new read is pending, keep showing the previous matches rather
  // than flashing back to a skeleton on every keystroke.
  return { detected: result?.detected ?? [], loading: result?.key !== key };
}

export function MessageExtractionResults({
  text,
  detected,
  loading,
  addedTestIds,
  onAdd,
  onRemove,
  onAddMany,
}: {
  text: string;
  detected: SearchTestResult[];
  loading: boolean;
  addedTestIds: Set<string>;
  onAdd: (result: SearchTestResult) => void;
  onRemove: (testId: string) => void;
  onAddMany: (results: SearchTestResult[]) => void;
}) {
  const newDetected = detected.filter((result) => !addedTestIds.has(result.testId));

  if (loading && detected.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-[62px] w-full rounded-xl" />
        <Skeleton className="h-[62px] w-full rounded-xl" />
      </div>
    );
  }

  if (detected.length === 0) {
    return (
      <div className="flex flex-col gap-1.5 px-4 py-14 text-center">
        <p className="text-[15px] font-medium">{text.trim() ? "No tests recognised" : "Paste a message to start"}</p>
        <p className="text-[13px] text-muted-foreground">
          We match test names, codes and common nicknames like &ldquo;sugar test&rdquo;.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-2 pt-1 pb-2">
        <span className={resultsTitleClassName}>
          Found {detected.length} test{detected.length === 1 ? "" : "s"} in the message
        </span>
        {newDetected.length > 1 ? (
          <button
            type="button"
            onClick={() => onAddMany(newDetected)}
            className="h-7 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Add all {newDetected.length}
          </button>
        ) : null}
      </div>
      {detected.map((result) => (
        <TestResultCard
          key={result.testId}
          result={result}
          added={addedTestIds.has(result.testId)}
          onAdd={onAdd}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}
