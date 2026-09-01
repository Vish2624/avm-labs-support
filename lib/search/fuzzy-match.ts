/**
 * Trigram/typo-tolerant similarity scoring between a query and candidate
 * text. Both inputs are expected to already be run through normalizeQuery().
 *
 * Reimplements Postgres pg_trgm's similarity() approach (the extension is
 * enabled and GIN-indexed on tests/test_aliases in the schema) as plain JS:
 * pad the string, extract character trigrams, score by Jaccard similarity
 * (shared trigrams / union of trigrams). Doing this in memory rather than as
 * a SQL query keeps ranking a pure, unit-testable function with no DB
 * round-trip, and produces the same kind of typo tolerance pg_trgm gives
 * (e.g. "vitmin d" still matches "vitamin d").
 *
 * Returns a similarity score from 0 (no shared trigrams) to 1 (identical).
 */
export function fuzzyMatch(query: string, candidate: string): number {
  if (!query || !candidate) return 0;
  if (query === candidate) return 1;

  const queryGrams = trigrams(query);
  const candidateGrams = trigrams(candidate);
  if (queryGrams.size === 0 || candidateGrams.size === 0) return 0;

  let shared = 0;
  for (const gram of queryGrams) {
    if (candidateGrams.has(gram)) shared += 1;
  }

  const union = queryGrams.size + candidateGrams.size - shared;
  return union === 0 ? 0 : shared / union;
}

/** Character trigrams of a padded string, e.g. "cbc" -> {"  c", " cb", "cbc", "bc "}. */
function trigrams(value: string): Set<string> {
  const padded = `  ${value} `;
  const grams = new Set<string>();
  for (let i = 0; i <= padded.length - 3; i++) {
    grams.add(padded.slice(i, i + 3));
  }
  return grams;
}
