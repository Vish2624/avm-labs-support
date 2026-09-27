"use client";

import { useEffect, useRef } from "react";
import { looksLikePhoneNumber, type SearchEventInput } from "@/lib/validation/search-event-schema";

const EVENTS_URL = "/api/search/events";
/** A zero-result search the agent has looked at this long is a miss, even if they never type again. */
const MISS_IDLE_MS = 8_000;
/** A pick this soon after a miss is recorded as recovering from it ("sugar fasting" -> "FBS"). */
const RECOVERY_WINDOW_MS = 60_000;
/** Shorter zero-result queries are mid-typing noise, not something worth an alias. */
const MIN_MISS_LENGTH = 3;
const MAX_QUERY_LENGTH = 100;

interface PendingMiss {
  query: string;
  locationId: string | null;
}

/** One query typed on from the other, either way ("chol" / "cholest") — the same search still being edited. */
function isContinuation(a: string, b: string): boolean {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  return left.startsWith(right) || right.startsWith(left);
}

function send(event: SearchEventInput) {
  if (looksLikePhoneNumber(event.query)) return;
  const body = JSON.stringify(event);
  // sendBeacon survives the tab closing; fetch+keepalive is the fallback. Best-effort either way.
  try {
    if (navigator.sendBeacon?.(EVENTS_URL, new Blob([body], { type: "application/json" }))) return;
  } catch {
    // Fall through to fetch.
  }
  void fetch(EVENTS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

/**
 * Logs the search box's finished searches for the admin's missed-searches
 * review — one event per search, never per keystroke:
 * - a pick (recordPick) when the agent adds a test from the results;
 * - a miss when a query settles on zero rule-based results and is then
 *   abandoned: left on screen for MISS_IDLE_MS, replaced by an unrelated
 *   query, cleared, or the tab/page is left. Typing on from a zero-result
 *   prefix into a query that does match is not a miss.
 */
export function useSearchTelemetry({
  query,
  enabled,
  loaded,
  resultCount,
  rankedTestIds,
  locationId,
}: {
  /** The debounced, trimmed search-box query. */
  query: string;
  /** False when the search box isn't the active input (another tab, or a pasted list). */
  enabled: boolean;
  /** True once every rule-based results request for `query` has settled. */
  loaded: boolean;
  /** Rule-based tests + packages found for `query` (the AI fallback list not counted). */
  resultCount: number;
  /** Rule-based test results, best-first, deduped across service types — the pick's rank. */
  rankedTestIds: string[];
  locationId: string | null;
}) {
  const pendingMissRef = useRef<PendingMiss | null>(null);
  const lastMissRef = useRef<{ query: string; at: number } | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function flushMiss() {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = null;
    const miss = pendingMissRef.current;
    pendingMissRef.current = null;
    if (!miss) return;
    send({
      query: miss.query,
      locationId: miss.locationId,
      resultCount: 0,
      pickedTestId: null,
      pickedRank: null,
      previousMissQuery: null,
    });
    lastMissRef.current = { query: miss.query, at: Date.now() };
  }

  useEffect(() => {
    const pending = pendingMissRef.current;
    if (!enabled || !query) {
      flushMiss();
      return;
    }
    if (!loaded) return;

    if (resultCount > 0) {
      // Typed on (or back) from a zero-result prefix into a real match: that
      // was an unfinished word, not a miss. Anything else abandons the miss.
      if (pending && isContinuation(pending.query, query)) {
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        pendingMissRef.current = null;
      } else {
        flushMiss();
      }
      return;
    }

    if (pending && !isContinuation(pending.query, query)) flushMiss();
    if (query.length < MIN_MISS_LENGTH) return;
    pendingMissRef.current = { query: query.slice(0, MAX_QUERY_LENGTH), locationId };
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(flushMiss, MISS_IDLE_MS);
  }, [query, enabled, loaded, resultCount, locationId]);

  // Leaving the workspace or closing the tab still records the miss on screen.
  useEffect(() => {
    window.addEventListener("pagehide", flushMiss);
    return () => {
      window.removeEventListener("pagehide", flushMiss);
      flushMiss();
    };
  }, []);

  /** Call when the agent adds a test from the search box's results. */
  function recordPick(testId: string) {
    if (!enabled || !query) return;
    // Zero rule-based results but a pick (from the AI fallback list): this
    // row is the miss and its recovery at once, so no separate miss.
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    pendingMissRef.current = null;

    const lastMiss = lastMissRef.current;
    const recovered = lastMiss && Date.now() - lastMiss.at <= RECOVERY_WINDOW_MS ? lastMiss.query : null;
    // Only the first pick after a miss is its recovery; later ones are the rest of the quote.
    lastMissRef.current = null;

    const rank = rankedTestIds.indexOf(testId);
    send({
      query: query.slice(0, MAX_QUERY_LENGTH),
      locationId,
      resultCount,
      pickedTestId: testId,
      pickedRank: rank === -1 ? null : rank + 1,
      previousMissQuery: recovered,
    });
  }

  return { recordPick };
}
