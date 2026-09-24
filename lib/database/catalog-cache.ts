import "server-only";

// Search reads the whole catalog (every test, alias, package roster and the
// location's current prices) on every keystroke. Reloading that from
// Supabase each time cost ~2s per search, so the server keeps a snapshot in
// memory instead:
//
// - Fresh for FRESH_MS; after that the stale snapshot is still served
//   immediately while a refresh loads in the background.
// - Every admin write in lib/database calls invalidateCatalogCache(), so an
//   edit shows up at once on the instance that made it. Other serverless
//   instances pick it up within FRESH_MS (plus one request).
// - A failed load is never cached — the next request retries.

const FRESH_MS = 60_000;

interface Entry {
  value: Promise<unknown>;
  loadedAt: number;
  refreshing: boolean;
}

const entries = new Map<string, Entry>();
let generation = 0;

function load<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const startedGeneration = generation;
  const value = loader();
  const entry: Entry = { value, loadedAt: Date.now(), refreshing: false };
  entries.set(key, entry);
  value.catch(() => {
    if (entries.get(key) === entry) entries.delete(key);
  });
  // An invalidation that lands while this load is in flight may have
  // raced the write it's meant to reflect — don't keep the result past it.
  value.then(() => {
    if (generation !== startedGeneration && entries.get(key) === entry) entries.delete(key);
  }, () => {});
  return value;
}

export function cachedCatalogRead<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const entry = entries.get(key);
  if (!entry) return load(key, loader);

  if (Date.now() - entry.loadedAt > FRESH_MS && !entry.refreshing) {
    entry.refreshing = true;
    const startedGeneration = generation;
    loader().then(
      (value) => {
        if (generation === startedGeneration && entries.get(key) === entry) {
          entries.set(key, { value: Promise.resolve(value), loadedAt: Date.now(), refreshing: false });
        }
      },
      () => {
        entry.refreshing = false;
      }
    );
  }
  return entry.value as Promise<T>;
}

/** Drop every cached catalog snapshot — call after any write to tests, aliases, packages or prices. */
export function invalidateCatalogCache(): void {
  generation += 1;
  entries.clear();
}

/**
 * Wraps a write so the catalog cache is dropped once it settles — success
 * or failure, since a multi-step write can fail after partly landing.
 */
export function invalidatesCatalog<Args extends unknown[], Result>(
  write: (...args: Args) => Promise<Result>
): (...args: Args) => Promise<Result> {
  return async (...args) => {
    try {
      return await write(...args);
    } finally {
      invalidateCatalogCache();
    }
  };
}
