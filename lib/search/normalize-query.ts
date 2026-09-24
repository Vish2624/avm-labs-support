/**
 * Lowercase/trim/strip punctuation from a raw search query (or any
 * code/name/alias text) before matching. Applied identically to the query
 * and every candidate string so comparisons are apples-to-apples.
 */
export function normalizeQuery(raw: string): string {
  const cached = normalizedCache.get(raw);
  if (cached !== undefined) return cached;
  if (normalizedCache.size >= NORMALIZED_CACHE_LIMIT) normalizedCache.clear();
  const normalized = normalize(raw);
  normalizedCache.set(raw, normalized);
  return normalized;
}

// Every catalog code/name is re-normalized on every search; memoize it.
const NORMALIZED_CACHE_LIMIT = 20_000;
const normalizedCache = new Map<string, string>();

function normalize(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "") // strip diacritics (accented Latin letters -> plain)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ") // punctuation/symbols -> space
    .replace(/\s+/g, " ")
    .trim();
}
