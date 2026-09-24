"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { TestResultCard } from "./test-result-card";
import { resultsTitleClassName } from "./search-results";
import { AVAILABILITY_LABELS } from "@/lib/constants/availability";
import type { ServiceTypeFilter } from "@/lib/constants/service-types";
import type { SearchTestResult } from "@/types/search";
import type { NotOfferedTest } from "@/lib/search/extract-tests";

const EXTRACT_DEBOUNCE_MS = 400;

interface Extraction {
  detected: SearchTestResult[];
  notOffered: NotOfferedTest[];
  unmatched: string[];
}

const EMPTY_EXTRACTION: Extraction = { detected: [], notOffered: [], unmatched: [] };

// One toast id, so re-reading an edited message replaces the last
// notification instead of stacking a new one per keystroke pause.
const EXTRACTION_TOAST_ID = "message-extraction";
const MAX_TOAST_NAMES = 12;

/** Pop-up summary of a finished read: how many tests were found, how many weren't. */
function notifyExtraction(extraction: Extraction, failed: boolean) {
  if (failed) {
    toast.error("Couldn't read the tests — please try again.", { id: EXTRACTION_TOAST_ID });
    return;
  }
  const requested = extraction.detected.length + extraction.notOffered.length + extraction.unmatched.length;
  if (requested === 0) {
    toast.error("No tests recognised in this message.", { id: EXTRACTION_TOAST_ID });
    return;
  }
  const available = extraction.detected.filter((result) => result.availability === "available").length;
  const notAvailable = requested - available;
  const found = `${available} of ${requested} test${requested === 1 ? "" : "s"} found`;
  if (notAvailable === 0) {
    toast.success(found, { id: EXTRACTION_TOAST_ID });
  } else {
    // Name them right in the pop-up — what's missing is what the agent has
    // to tell the customer. Long lists are trimmed; the red box has them all.
    const names = [
      ...extraction.unmatched,
      ...extraction.notOffered.map((test) => test.code),
      ...extraction.detected.filter((result) => result.availability !== "available").map((result) => result.code),
    ];
    const shown = names.slice(0, MAX_TOAST_NAMES).join(", ");
    const more = names.length > MAX_TOAST_NAMES ? ` +${names.length - MAX_TOAST_NAMES} more` : "";
    toast.warning(`${found} · ${notAvailable} not available`, {
      id: EXTRACTION_TOAST_ID,
      description: `Not available: ${shown}${more}`,
      duration: 10_000,
    });
  }
}

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
      let failed = false;
      try {
        const response = await fetch("/api/search/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: trimmed, locationId, serviceType }),
        });
        if (response.ok) extraction = (await response.json()) as Extraction;
        else failed = true;
      } catch {
        // Network error — show nothing found rather than a stale list.
        failed = true;
      }
      if (cancelled) return;
      setResult({ key, extraction });
      notifyExtraction(extraction, failed);
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

/**
 * What the agent needs to tell the customer can't be quoted, grouped by
 * why: not a test we have at all, a real test not priced at this
 * location/service type, or priced but currently marked unavailable.
 */
function NotAvailableSummary({
  notFound,
  notOffered,
  unavailable,
  locationName,
}: {
  notFound: string[];
  notOffered: NotOfferedTest[];
  unavailable: SearchTestResult[];
  locationName: string | null;
}) {
  const total = notFound.length + notOffered.length + unavailable.length;
  if (total === 0) return null;

  const groups = [
    {
      label: "Not in our test list",
      items: notFound.map((token) => ({ key: token, primary: token, secondary: null as string | null })),
    },
    {
      label: locationName ? `Not offered at ${locationName}` : "Not offered at this location",
      items: notOffered.map((test) => ({ key: test.code, primary: test.officialName, secondary: test.code })),
    },
    {
      label: "Currently unavailable",
      items: unavailable.map((result) => ({
        key: result.testId,
        primary: result.officialName,
        secondary: AVAILABILITY_LABELS[result.availability],
      })),
    },
  ].filter((group) => group.items.length > 0);

  return (
    <div className="mx-2 mb-3 rounded-xl border border-destructive/25 bg-destructive/5 px-3.5 py-3">
      <p className="text-[13px] font-semibold text-destructive">
        {total} test{total === 1 ? "" : "s"} not available
      </p>
      <div className="mt-2 flex flex-col gap-2.5">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="text-[12px] font-medium text-muted-foreground">
              {group.label} ({group.items.length})
            </p>
            <ol className="mt-1 list-decimal pl-5 text-[13px] leading-relaxed">
              {group.items.map((item) => (
                <li key={item.key}>
                  {item.primary}
                  {item.secondary ? <span className="text-muted-foreground"> · {item.secondary}</span> : null}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MessageExtractionResults({
  text,
  detected,
  notOffered = [],
  unmatched = [],
  loading,
  locationName = null,
  addedTestIds,
  onAdd,
  onRemove,
  onAddMany,
}: {
  text: string;
  detected: SearchTestResult[];
  notOffered?: NotOfferedTest[];
  unmatched?: string[];
  loading: boolean;
  locationName?: string | null;
  addedTestIds: Set<string>;
  onAdd: (result: SearchTestResult) => void;
  onRemove: (testId: string) => void;
  onAddMany: (results: SearchTestResult[]) => void;
}) {
  const available = detected.filter((result) => result.availability === "available");
  const unavailable = detected.filter((result) => result.availability !== "available");
  const newAvailable = available.filter((result) => !addedTestIds.has(result.testId));
  const requested = detected.length + notOffered.length + unmatched.length;
  const notAvailableCount = requested - available.length;

  if (loading && requested === 0) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-[62px] w-full rounded-xl" />
        <Skeleton className="h-[62px] w-full rounded-xl" />
      </div>
    );
  }

  if (requested === 0) {
    return (
      <div className="flex flex-col gap-1.5 px-4 py-14 text-center">
        <p className="text-[15px] font-medium">{text.trim() ? "No tests recognised" : "Paste a message, then press Find tests"}</p>
        <p className="text-[13px] text-muted-foreground">
          We match test names, codes and common nicknames like &ldquo;sugar test&rdquo;.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-3 px-2 pt-1 pb-2">
        <span className={resultsTitleClassName}>
          {requested} requested · {available.length} available
          {notAvailableCount > 0 ? <span className="text-destructive"> · {notAvailableCount} not available</span> : null}
        </span>
        {newAvailable.length > 1 ? (
          <button
            type="button"
            onClick={() => onAddMany(newAvailable)}
            className="h-7 shrink-0 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Add all {newAvailable.length}
          </button>
        ) : null}
      </div>
      <NotAvailableSummary
        notFound={unmatched}
        notOffered={notOffered}
        unavailable={unavailable}
        locationName={locationName}
      />
      {[...available, ...unavailable].map((result) => (
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
