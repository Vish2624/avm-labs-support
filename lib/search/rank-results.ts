/**
 * Order search results. Exact matches (a test's own code/name/short name,
 * or an exact alias) always come first; everything else is ordered by how
 * close the match is, whether it came from the catalog or an alias — a
 * near-perfect name match shouldn't sit below a loose alias match. Ties go
 * to alias matches (admin-curated). Pure algorithm — no database access.
 */

// "ai": picked by the semantic fallback (lib/search/ai-search.ts), never by the ranker here.
export type SearchMatchType = "exact" | "alias" | "fuzzy" | "ai";

export interface SearchCandidate {
  testId: string;
  matchType: SearchMatchType;
  /** 0-100 closeness of the match. */
  score: number;
  /** An alias that matched the query exactly (spacing/punctuation aside). */
  exact?: boolean;
  /** The alias text that produced this candidate, when matchType is "alias". */
  matchedAlias?: string;
}

function tier(candidate: SearchCandidate): number {
  if (candidate.matchType === "exact") return 3;
  if (candidate.exact) return 2;
  return 1;
}

function compare(a: SearchCandidate, b: SearchCandidate): number {
  const tierDiff = tier(b) - tier(a);
  if (tierDiff !== 0) return tierDiff;
  const scoreDiff = b.score - a.score;
  if (Math.abs(scoreDiff) > 0.5) return scoreDiff;
  return (b.matchType === "alias" ? 1 : 0) - (a.matchType === "alias" ? 1 : 0);
}

/**
 * Dedupes to the single best candidate per test (a test can match on
 * multiple signals — e.g. both an alias and fuzzy name similarity — only
 * the strongest is kept) and sorts best-first.
 */
export function rankResults(candidates: SearchCandidate[]): SearchCandidate[] {
  const bestByTest = new Map<string, SearchCandidate>();

  for (const candidate of candidates) {
    const existing = bestByTest.get(candidate.testId);
    if (!existing || compare(candidate, existing) < 0) {
      bestByTest.set(candidate.testId, candidate);
    }
  }

  return [...bestByTest.values()].sort(compare);
}
