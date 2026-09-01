import "server-only";
import { listActiveTests } from "@/lib/database/tests";
import { listActiveAliases } from "@/lib/database/aliases";
import { normalizeQuery } from "./normalize-query";
import { buildSearchCandidates } from "./build-search-candidates";
import { rankResults, type SearchMatchType } from "./rank-results";

export interface ResolvedTestQuery {
  /** The raw chip text as typed. */
  query: string;
  test: { id: string; code: string; officialName: string } | null;
  matchType: SearchMatchType | null;
  /** The alias text that matched, when matchType is "alias". */
  matchedAlias: string | null;
}

/**
 * Resolve free-text test names/codes/aliases to catalog test ids — the same
 * alias+fuzzy matching primitive as searchTests(), but without a price
 * join, since a chip names a real catalog test regardless of whether it
 * currently has a price row at any particular location/service type.
 * Powers /profiles' "search by test names" chip mode.
 */
export async function resolveTestIds(queries: string[]): Promise<ResolvedTestQuery[]> {
  const [tests, aliases] = await Promise.all([listActiveTests(), listActiveAliases()]);
  const testById = new Map(tests.map((test) => [test.id, test]));

  return queries.map((query) => {
    const normalized = normalizeQuery(query);
    if (!normalized) return { query, test: null, matchType: null, matchedAlias: null };

    const [best] = rankResults(buildSearchCandidates(normalized, tests, aliases));
    const test = best ? testById.get(best.testId) : undefined;
    if (!best || !test) return { query, test: null, matchType: null, matchedAlias: null };

    return {
      query,
      test: { id: test.id, code: test.code, officialName: test.officialName },
      matchType: best.matchType,
      matchedAlias: best.matchedAlias ?? null,
    };
  });
}
