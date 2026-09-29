/// <reference lib="webworker" />

// Free, in-browser semantic search for the Quote screen — no API key, no
// server cost, and queries never leave the agent's computer.
//
// Runs a small open-source sentence-embedding model (all-MiniLM-L6-v2,
// ~23 MB, downloaded once from the Hugging Face CDN and then cached by the
// browser) inside this Web Worker so the page never freezes. Each catalog
// item's names/aliases become a vector once (kept in IndexedDB, keyed by
// the text, so only new or renamed items are ever re-embedded); a query is
// embedded the same way and matched by cosine similarity. The worker only
// returns catalog ids — prices, TAT and availability always come from the
// database afterwards (see /api/search/semantic).

const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3";
const MODEL = "Xenova/all-MiniLM-L6-v2";
const EMBED_BATCH = 32;
const DB_NAME = "avm-semantic-search";
const STORE = "embeddings";
/** Cache key prefix: bump when the model or text format changes. */
const CACHE_VERSION = "minilm-v1:";

export interface CatalogItem {
  kind: "test" | "package";
  id: string;
  text: string;
}

export type WorkerRequest =
  | { type: "index"; items: CatalogItem[] }
  | { type: "search"; requestId: number; query: string; limit: number };

export type WorkerResponse =
  | { type: "ready"; count: number }
  | { type: "error"; message: string }
  | { type: "results"; requestId: number; matches: { kind: "test" | "package"; id: string; score: number }[] };

type Extractor = (
  input: string | string[],
  options: { pooling: "mean"; normalize: boolean }
) => Promise<{ tolist: () => number[][] }>;

// Loaded from the CDN at runtime rather than bundled: the library is large
// and only needed once the agent actually searches.
const importFromUrl = new Function("url", "return import(url)") as (url: string) => Promise<{
  pipeline: (task: string, model: string, options?: Record<string, unknown>) => Promise<Extractor>;
}>;

let extractorPromise: Promise<Extractor> | null = null;
function getExtractor(): Promise<Extractor> {
  extractorPromise ??= importFromUrl(TRANSFORMERS_URL).then(({ pipeline }) =>
    pipeline("feature-extraction", MODEL, { dtype: "q8" })
  );
  return extractorPromise;
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null); // Storage blocked — everything still works, just re-embeds each session.
    }
  });
}

function readCached(db: IDBDatabase | null, keys: string[]): Promise<(Float32Array | undefined)[]> {
  if (!db) return Promise.resolve(keys.map(() => undefined));
  return new Promise((resolve) => {
    const store = db.transaction(STORE, "readonly").objectStore(STORE);
    const out: (Float32Array | undefined)[] = new Array(keys.length);
    let pending = keys.length;
    if (pending === 0) resolve(out);
    keys.forEach((key, i) => {
      const request = store.get(key);
      request.onsuccess = () => {
        out[i] = request.result as Float32Array | undefined;
        if (--pending === 0) resolve(out);
      };
      request.onerror = () => {
        if (--pending === 0) resolve(out);
      };
    });
  });
}

function writeCached(db: IDBDatabase | null, entries: [string, Float32Array][]) {
  if (!db || entries.length === 0) return;
  const store = db.transaction(STORE, "readwrite").objectStore(STORE);
  for (const [key, vector] of entries) store.put(vector, key);
}

let catalog: { kind: "test" | "package"; id: string; vector: Float32Array }[] = [];
let indexing: Promise<void> | null = null;

async function buildIndex(items: CatalogItem[]) {
  const extractor = await getExtractor();
  const db = await openDb();
  const keys = items.map((item) => CACHE_VERSION + item.text.toLowerCase());
  const cached = await readCached(db, keys);

  const missing = items.map((_, i) => i).filter((i) => !cached[i]);
  const fresh: [string, Float32Array][] = [];
  for (let start = 0; start < missing.length; start += EMBED_BATCH) {
    const batch = missing.slice(start, start + EMBED_BATCH);
    const output = await extractor(
      batch.map((i) => items[i].text),
      { pooling: "mean", normalize: true }
    );
    output.tolist().forEach((vector, j) => {
      const i = batch[j];
      cached[i] = Float32Array.from(vector);
      fresh.push([keys[i], cached[i]!]);
    });
  }
  writeCached(db, fresh);

  catalog = items.map((item, i) => ({ kind: item.kind, id: item.id, vector: cached[i]! }));
}

function dot(a: Float32Array, b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum; // vectors are normalized, so this is cosine similarity
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  try {
    if (message.type === "index") {
      indexing = buildIndex(message.items);
      await indexing;
      (self as DedicatedWorkerGlobalScope).postMessage({ type: "ready", count: catalog.length } satisfies WorkerResponse);
      return;
    }

    if (indexing) await indexing;
    const extractor = await getExtractor();
    const [queryVector] = (await extractor(message.query, { pooling: "mean", normalize: true })).tolist();
    const matches = catalog
      .map((item) => ({ kind: item.kind, id: item.id, score: dot(item.vector, queryVector) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, message.limit);
    (self as DedicatedWorkerGlobalScope).postMessage({
      type: "results",
      requestId: message.requestId,
      matches,
    } satisfies WorkerResponse);
  } catch (error) {
    (self as DedicatedWorkerGlobalScope).postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    } satisfies WorkerResponse);
  }
};
