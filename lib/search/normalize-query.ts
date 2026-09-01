/**
 * Lowercase/trim/strip punctuation from a raw search query (or any
 * code/name/alias text) before matching. Applied identically to the query
 * and every candidate string so comparisons are apples-to-apples.
 */
export function normalizeQuery(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "") // strip diacritics (accented Latin letters -> plain)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ") // punctuation/symbols -> space
    .replace(/\s+/g, " ")
    .trim();
}
