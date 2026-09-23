"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { TestResultCard } from "./test-result-card";
import { resultsTitleClassName } from "./search-results";
import type { ServiceTypeFilter } from "@/lib/constants/service-types";
import type { SearchTestResult } from "@/types/search";

const EXTRACT_DEBOUNCE_MS = 400;

interface Extraction {
  detected: SearchTestResult[];
  unmatched: string[];
}

const EMPTY_EXTRACTION: Extraction = { detected: [], unmatched: [] };

/**
 * Reads every test mentioned in a customer's raw message or a pasted list
 * of codes ("ACCP, ALKP, AMYL, ...") via /api/search/extract — the same
 * alias/fuzzy matcher as the search box, run server-side over the whole
 * message in one request (lib/search/extract-tests.ts). Only real
 * catalog/alias matches with a current price at this location come back;
 * tokens that matched nothing are returned too, so the agent can see what
 * still needs a manual search.
 */
export function useMessageExtraction(text: string, locationId: string, serviceType: ServiceTypeFilter) {
  // Results are stored with the request they answer, so "loading" can be
  // derived (does the stored result match the current input?) instead of
  // being reset inside the effect.
  const [result, setResult] = useState<{ key: string; extraction: Extraction } | null>(null);

  const trimmed = text.trim();
  const key = trimmed && locationId ? JSON.stringify([trimmed, locationId, serviceType]) : null;

  useEffect(() => {
    if (!key) return;

    let cancelled = false;
    const timeout = setTimeout(async () => {
      let extraction = EMPTY_EXTRACTION;
      try {
        const response = await fetch("/api/search/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: trimmed, locationId, serviceType }),
        });
        if (response.ok) extraction = (await response.json()) as Extraction;
      } catch {
        // Network error — show nothing found rather than a stale list.
      }
      if (!cancelled) setResult({ key, extraction });
    }, EXTRACT_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [key, trimmed, locationId, serviceType]);

  if (!key) return { ...EMPTY_EXTRACTION, loading: false };
  // While a new read is pending, keep showing the previous matches rather
  // than flashing back to a skeleton on every keystroke.
  return { ...(result?.extraction ?? EMPTY_EXTRACTION), loading: result?.key !== key };
}

export function MessageExtractionResults({
  text,
  detected,
  unmatched = [],
  loading,
  addedTestIds,
  onAdd,
  onRemove,
  onAddMany,
}: {
  text: string;
  detected: SearchTestResult[];
  unmatched?: string[];
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
          {unmatched.length > 0
            ? `Nothing priced at this location for: ${unmatched.join(", ")}`
            : "We match test names, codes and common nicknames like “sugar test”."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-2 pt-1 pb-2">
        <span className={resultsTitleClassName}>
          Found {detected.length} test{detected.length === 1 ? "" : "s"}
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
      {unmatched.length > 0 ? (
        <p className="mx-2 mb-2 rounded-lg bg-muted px-3 py-2 text-[13px] text-muted-foreground">
          <span className="font-medium text-foreground">Not found here ({unmatched.length}):</span>{" "}
          {unmatched.join(", ")}
        </p>
      ) : null}
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
