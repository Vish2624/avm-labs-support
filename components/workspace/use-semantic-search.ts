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

/**
 * The shared in-browser model's status, starting it shortly after `wanted`
 * turns true. It's only wanted once the server has said Gemini isn't set
 * up — otherwise Gemini does this job and the ~23 MB model and catalog
 * indexing would just cost every agent's computer bandwidth and CPU.
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

/** Extra pause after typing stops before asking Gemini, so it isn't called for every half-typed word. */
const GEMINI_SEARCH_DELAY_MS = 350;
/** Set once the server says Gemini isn't set up — the in-browser model is used from then on. */
let geminiSearchMissing = false;

/** Gemini's picks for a search (/api/search/ai), priced; null when it isn't set up or failed. */
async function geminiSearch(query: string, locationId: string, serviceType: ServiceTypeFilter) {
  try {
    const response = await fetch("/api/search/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, locationId, serviceType }),
    });
    if (response.status === 501) geminiSearchMissing = true;
    if (!response.ok) return null;
    return ((await response.json()) as { items: SemanticSearchItem[] }).items.slice(0, MAX_MATCHES);
  } catch {
    return null;
  }
}

/**
 * AI fallback for the Quote search box, used when the rule-based search
 * has no strong hit (`enabled`). Gemini (free-tier key) picks catalog items
 * by meaning — "hair fall", "sugr tst" — and the server prices them from
 * the DB. Without a key, or if Gemini fails, the free in-browser model
 * (semantic-engine.ts) does the same job, less well. Returns null when not
 * asked, or when no AI is available (search just stays rule-based).
 */
export function useSemanticSearch(
  query: string,
  enabled: boolean,
  locationId: string,
  serviceType: ServiceTypeFilter
): SemanticSearchState | null {
  const useGemini = !geminiSearchMissing;
  const status = useEngine(!useGemini);
  const [result, setResult] = useState<{ key: string; items: SemanticSearchItem[] } | null>(null);

  const trimmed = query.trim();
  const key = enabled && trimmed && locationId ? JSON.stringify([trimmed.toLowerCase(), locationId, serviceType]) : null;
  // With Gemini, the in-browser model's loading status is irrelevant — don't
  // re-run (and re-ask Gemini) when it changes.
  const modelStatus = useGemini ? "unused" : status;

  useEffect(() => {
    if (!key) return;
    if (!useGemini && modelStatus !== "ready") return;
    let cancelled = false;
    const timer = window.setTimeout(
      async () => {
        let items = useGemini ? await geminiSearch(trimmed, locationId, serviceType) : null;
        if (items === null) {
          // Gemini unavailable: the in-browser model, if it's loaded.
          const scored = getEngineStatus() === "ready" ? await scoreQuery(trimmed, MAX_MATCHES * 2) : null;
          items = scored ? await priceMatches(toMatches(scored, MAX_MATCHES), locationId, serviceType) : [];
        }
        if (!cancelled) setResult({ key, items });
      },
      useGemini ? GEMINI_SEARCH_DELAY_MS : 0
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [key, useGemini, modelStatus, trimmed, locationId, serviceType]);

  if (!key) return null;
  if (!useGemini) {
    if (status === "idle" || status === "failed") return null;
    if (status === "preparing") return { preparing: true, loading: true, items: [] };
  }
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
 * Free AI fallback for "Paste text or image" when Gemini isn't set up: each
 * name the rule-based reader couldn't recognise (`unmatched`) is matched by
 * meaning to its single best catalog item — a test or a package — then
 * priced from the DB. Names the model can't place with any confidence stay
 * in "Not in our test list". With Gemini, the paste reader already matched
 * by meaning, so this stays off.
 */
export function useSemanticMessageMatches(
  unmatched: string[],
  locationId: string,
  serviceType: ServiceTypeFilter
): MessageAiState | null {
  const wanted = geminiSearchMissing;
  const status = useEngine(wanted);
  const [result, setResult] = useState<{ key: string; matches: MessageAiMatch[] } | null>(null);

  const key = wanted && unmatched.length > 0 && locationId ? JSON.stringify([unmatched, locationId, serviceType]) : null;

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
