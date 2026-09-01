/**
 * Order search results: exact match > alias match > fuzzy similarity score,
 * per AVM_PLAN.md's ranking rule. Pure algorithm over candidate
 * matches — no database access.
 */

export type SearchMatchType = "exact" | "alias" | "fuzzy";

export interface SearchCandidate {
  testId: string;
  matchType: SearchMatchType;
  /** 0-100. Only comparable within the same matchType — matchType always wins first. */
  score: number;
  /** The alias text that produced this candidate, when matchType is "alias". */
  matchedAlias?: string;
}

const MATCH_TYPE_PRIORITY: Record<SearchMatchType, number> = {
  exact: 3,
  alias: 2,
  fuzzy: 1,
};

/**
 * Dedupes to the single best candidate per test (a test can match on
 * multiple signals — e.g. both an alias and fuzzy name similarity — only
 * the strongest is kept) and sorts best-first.
 */
export function rankResults(candidates: SearchCandidate[]): SearchCandidate[] {
  const bestByTest = new Map<string, SearchCandidate>();

  for (const candidate of candidates) {
    const existing = bestByTest.get(candidate.testId);
    if (!existing || isBetter(candidate, existing)) {
      bestByTest.set(candidate.testId, candidate);
    }
  }

  return [...bestByTest.values()].sort((a, b) => {
    const priorityDiff = MATCH_TYPE_PRIORITY[b.matchType] - MATCH_TYPE_PRIORITY[a.matchType];
    if (priorityDiff !== 0) return priorityDiff;
    return b.score - a.score;
  });
}

function isBetter(a: SearchCandidate, b: SearchCandidate): boolean {
  const priorityDiff = MATCH_TYPE_PRIORITY[a.matchType] - MATCH_TYPE_PRIORITY[b.matchType];
  if (priorityDiff !== 0) return priorityDiff > 0;
  return a.score > b.score;
}
