"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { getEngineStatus, scoreQuery, startSemanticEngine, subscribeEngine, toMatches } from "./semantic-engine";
import type { SemanticConfidence, SemanticMatch, SemanticSearchItem } from "@/lib/search/semantic-search-results";
import type { ServiceTypeFilter } from "@/lib/constants/service-types";

/** Candidates tried per unrecognised name in a pasted message. */
const CANDIDATES_PER_NAME = 3;
/** Start loading the model this long after it's first wanted, so the page itself settles first. */
const PRELOAD_DELAY_MS = 1000;

/**
 * The shared in-browser model's status, starting it shortly after `wanted`
 * turns true. It's only wanted when Gemini didn't read a pasted message —
 * otherwise the ~23 MB model and catalog indexing would just cost every
 * agent's computer bandwidth and CPU.
 */
function useEngine(wanted: boolean) {
  useEffect(() => {
    if (!wanted) return;
    const timer = window.setTimeout(startSemanticEngine, PRELOAD_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [wanted]);
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
 * Free in-browser AI backup for "Paste text or image", used only when
 * Gemini didn't read the message (`enabled` — no key, or Gemini failed):
 * each name the rule-based reader couldn't recognise (`unmatched`) is
 * matched by meaning to its single best catalog item — a test or a
 * package — then priced from the DB. Names the model can't place with any
 * confidence stay in "Not in our test list".
 */
export function useSemanticMessageMatches(
  unmatched: string[],
  locationId: string,
  serviceType: ServiceTypeFilter,
  enabled: boolean
): MessageAiState | null {
  const wanted = enabled && unmatched.length > 0;
  const status = useEngine(wanted);
  const [result, setResult] = useState<{ key: string; matches: MessageAiMatch[] } | null>(null);

  const key = wanted && locationId ? JSON.stringify([unmatched, locationId, serviceType]) : null;

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
