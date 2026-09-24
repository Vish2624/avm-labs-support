"use client";

import type { CatalogItem, WorkerRequest, WorkerResponse } from "@/lib/search/semantic-worker";
import type { SemanticMatch } from "@/lib/search/semantic-search-results";

// One shared in-browser AI model (lib/search/semantic-worker.ts) for the
// whole page — the search box and "Paste a message" both use it, so the
// model and catalog are only loaded once per page load (and cached by the
// browser across visits).

// Similarity (cosine, 0-1) bands, tuned on the real catalog: >= HIGH reads
// as the item meant ("kidney test" -> KFT 0.79, "thyroid check" -> Total
// Thyroid 0.60); MIN..HIGH is only "possible" ("heart test" -> Cardiac
// Profile 0.50); unrelated text ("pizza", "car insurance") scores under
// 0.30 and is never shown.
export const HIGH_SCORE = 0.55;
export const MIN_SCORE = 0.42;
/** Drop the tail once it falls this far below the best hit. */
const TAIL_GAP = 0.12;

export type EngineStatus = "idle" | "preparing" | "ready" | "failed";

type Scored = { kind: "test" | "package"; id: string; score: number }[];

let worker: Worker | null = null;
let status: EngineStatus = "idle";
let nextRequestId = 1;
const pending = new Map<number, (scored: Scored | null) => void>();
const listeners = new Set<() => void>();

function setStatus(next: EngineStatus) {
  status = next;
  for (const listener of listeners) listener();
}

export function getEngineStatus(): EngineStatus {
  return status;
}

export function subscribeEngine(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Starts loading the model + catalog (idempotent). */
export function startSemanticEngine(): void {
  if (worker || status === "failed") return;
  try {
    worker = new Worker(new URL("../../lib/search/semantic-worker.ts", import.meta.url), { type: "module" });
  } catch {
    setStatus("failed");
    return;
  }
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const message = event.data;
    if (message.type === "ready") {
      setStatus("ready");
    } else if (message.type === "error") {
      if (status === "preparing") setStatus("failed");
      for (const resolve of pending.values()) resolve(null);
      pending.clear();
    } else {
      const resolve = pending.get(message.requestId);
      pending.delete(message.requestId);
      resolve?.(message.matches);
    }
  };
  setStatus("preparing");
  fetch("/api/search/semantic-catalog")
    .then((response) => {
      if (!response.ok) throw new Error(`catalog ${response.status}`);
      return response.json() as Promise<{ items: CatalogItem[] }>;
    })
    .then(({ items }) => worker?.postMessage({ type: "index", items } satisfies WorkerRequest))
    .catch(() => setStatus("failed"));
}

/** Raw similarity scores for a query, best first; null if the engine isn't ready or failed. */
export function scoreQuery(query: string, limit: number): Promise<Scored | null> {
  if (!worker || status !== "ready") return Promise.resolve(null);
  const requestId = nextRequestId++;
  return new Promise((resolve) => {
    pending.set(requestId, resolve);
    worker!.postMessage({ type: "search", requestId, query, limit } satisfies WorkerRequest);
  });
}

/** Applies the score bands: drops weak/tail hits, labels the rest high or low confidence. */
export function toMatches(scored: Scored, max: number): SemanticMatch[] {
  const best = scored[0]?.score ?? 0;
  return scored
    .filter((match) => match.score >= MIN_SCORE && match.score >= best - TAIL_GAP)
    .slice(0, max)
    .map((match) => ({ kind: match.kind, id: match.id, confidence: match.score >= HIGH_SCORE ? "high" : "low" }));
}
