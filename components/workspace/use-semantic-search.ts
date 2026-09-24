"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { getEngineStatus, scoreQuery, startSemanticEngine, subscribeEngine, toMatches } from "./semantic-engine";
import type { SemanticConfidence, SemanticMatch, SemanticSearchItem } from "@/lib/search/semantic-search-results";
import type { ServiceTypeFilter } from "@/lib/constants/service-types";

const MAX_MATCHES = 6;
/** Candidates tried per unrecognised name in a pasted message. */
const CANDIDATES_PER_NAME = 3;
/** Start loading the model this long after the Quote screen opens, so the page itself loads first. */
const PRELOAD_DELAY_MS = 4000;

export interface SemanticSearchState {
  /** First run only: the model and catalog are still being prepared in the browser. */
  preparing: boolean;
  loading: boolean;
  items: SemanticSearchItem[];
}

/** Starts the shared in-browser model shortly after mount; returns its status. */
function useEngine() {
  useEffect(() => {
    const timer = window.setTimeout(startSemanticEngine, PRELOAD_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);
  return useSyncExternalStore(subscribeEngine, getEngineStatus, () => "idle" as const);
}

async function priceMatches(matches: SemanticMatch[], locationId: string, serviceType: ServiceTypeFilter) {
  if (matches.length === 0) return [];
  try {
    const response = await fetch("/api/search/semantic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matches, locationId, serviceType }),
    });
    if (response.ok) return ((await response.json()) as { items: SemanticSearchItem[] }).items;
  } catch {
    // Network error — fall back to the rule-based results only.
  }
  return [];
}

/**
 * Free AI fallback for the Quote search box: the shared in-browser model
 * (semantic-engine.ts) picks catalog items by meaning; the server then
 * prices them from the DB. `enabled` is false whenever the rule-based
 * search already found a strong hit. Returns null when not asked, or when
 * the model couldn't load (search just stays rule-based).
 */
export function useSemanticSearch(
  query: string,
  enabled: boolean,
  locationId: string,
  serviceType: ServiceTypeFilter
): SemanticSearchState | null {
  const status = useEngine();
  const [result, setResult] = useState<{ key: string; items: SemanticSearchItem[] } | null>(null);

  const trimmed = query.trim();
  const key = enabled && trimmed && locationId ? JSON.stringify([trimmed.toLowerCase(), locationId, serviceType]) : null;

  useEffect(() => {
    if (!key || status !== "ready") return;
    let cancelled = false;
    (async () => {
      const scored = await scoreQuery(trimmed, MAX_MATCHES * 2);
      const items = scored ? await priceMatches(toMatches(scored, MAX_MATCHES), locationId, serviceType) : [];
      if (!cancelled) setResult({ key, items });
    })();
    return () => {
      cancelled = true;
    };
  }, [key, status, trimmed, locationId, serviceType]);

  if (!key || status === "idle" || status === "failed") return null;
  if (status === "preparing") return { preparing: true, loading: true, items: [] };
  const done = result?.key === key;
  return { preparing: false, loading: !done, items: done ? result.items : [] };
}

export interface MessageAiMatch {
  /** The name as written in the message. */
  token: string;
  confidence: SemanticConfidence;
  item: SemanticSearchItem;
}

export interface MessageAiState {
  preparing: boolean;
  loading: boolean;
  matches: MessageAiMatch[];
}

/**
 * Free AI fallback for "Paste a message": each name the rule-based reader
 * couldn't recognise (`unmatched`) is matched by meaning to its single best
 * catalog item — a test or a package — then priced from the DB. Names the
 * model can't place with any confidence stay in "Not in our test list".
 */
export function useSemanticMessageMatches(
  unmatched: string[],
  locationId: string,
  serviceType: ServiceTypeFilter
): MessageAiState | null {
  const status = useEngine();
  const [result, setResult] = useState<{ key: string; matches: MessageAiMatch[] } | null>(null);

  const key = unmatched.length > 0 && locationId ? JSON.stringify([unmatched, locationId, serviceType]) : null;

  useEffect(() => {
    if (!key || status !== "ready") return;
    let cancelled = false;
    (async () => {
      // A few candidates per name, so the best one that is actually priced
      // at this location wins (the model's top pick may not be sold here).
      const picks: { token: string; candidates: SemanticMatch[] }[] = [];
      for (const token of unmatched) {
        const scored = await scoreQuery(token, CANDIDATES_PER_NAME * 2);
        const candidates = scored ? toMatches(scored, CANDIDATES_PER_NAME) : [];
        if (candidates.length > 0) picks.push({ token, candidates });
      }
      const items = await priceMatches(
        picks.flatMap((pick) => pick.candidates),
        locationId,
        serviceType
      );
      const itemById = new Map(items.map((item) => [item.kind === "test" ? item.result.testId : item.result.profileId, item]));
      const matches = picks.flatMap(({ token, candidates }) => {
        const match = candidates.find((candidate) => itemById.has(candidate.id));
        return match ? [{ token, confidence: match.confidence, item: itemById.get(match.id)! }] : [];
      });
      if (!cancelled) setResult({ key, matches });
    })();
    return () => {
      cancelled = true;
    };
  }, [key, status, unmatched, locationId, serviceType]);

  if (!key || status === "idle" || status === "failed") return null;
  if (status === "preparing") return { preparing: true, loading: true, matches: [] };
  const done = result?.key === key;
  return { preparing: false, loading: !done, matches: done ? result.matches : [] };
}
