import { normalizeQuery } from "./normalize-query";
import { matchScore } from "./fuzzy-match";
import { FUZZY_THRESHOLD, buildSearchCandidates, type SearchableAlias, type SearchableTest } from "./build-search-candidates";
import { rankResults } from "./rank-results";
import { queryVariants, VARIANT_SCORE_FACTOR } from "./query-variants";
import { dedupeProfilesByName } from "@/lib/profiles/dedupe-profiles";
import type { SearchTestResult } from "@/types/search";
import type { ProfileSearchResult, ProfileTestSummary } from "@/types/profile";

/**
 * Everything the Quote search box needs for one location + service type,
 * loaded into the browser once (/api/search/catalog) so each keystroke is
 * searched locally — instantly, with no request per keystroke. The same
 * pure matching as the server's searchTests()/searchProfilesByName();
 * every price is a real current DB price, joined on the server.
 */
export interface SearchCatalog {
  /** Every active test (matched against), priced here or not. */
  tests: SearchableTest[];
  aliases: SearchableAlias[];
  /** The tests priced here, A–Z — what results are built from. */
  priced: SearchTestResult[];
  /** The profiles/packages priced here, A–Z, with their rosters. */
  profiles: ProfileSearchResult[];
}

/** Cap on how many ranked matches are returned per search (same as the server). */
const MAX_RESULTS = 20;
/** A test the query resolves to only counts toward "profiles containing it" at or above this score. */
const CONTAINED_TEST_MIN_SCORE = 80;
/** How many of the query's best test matches are looked up inside profiles. */
const MAX_CONTAINED_TESTS = 3;

/** Tests matching the query, best first — searchTests(), run on the loaded catalog. */
export function searchCatalogTests(query: string, catalog: SearchCatalog): SearchTestResult[] {
  const variants = queryVariants(query);
  if (variants.length === 0) return [];
  const pricedById = new Map(catalog.priced.map((result) => [result.testId, result]));

  const candidates = variants.flatMap((variant, i) => {
    const found = buildSearchCandidates(variant, catalog.tests, catalog.aliases);
    return i === 0 ? found : found.map((candidate) => ({ ...candidate, score: candidate.score * VARIANT_SCORE_FACTOR }));
  });

  const results: SearchTestResult[] = [];
  for (const candidate of rankResults(candidates)) {
    const priced = pricedById.get(candidate.testId);
    // A matched test with no current price here isn't shown — never backfilled.
    if (!priced) continue;
    results.push({ ...priced, matchType: candidate.matchType, matchedAlias: candidate.matchedAlias ?? null });
    if (results.length === MAX_RESULTS) break;
  }
  return results;
}

/**
 * Profiles matching the query by their own name/code, then profiles that
 * contain the test the query names (smallest first) — searchProfilesByName(),
 * run on the loaded catalog.
 */
export function searchCatalogProfiles(query: string, catalog: SearchCatalog): ProfileSearchResult[] {
  const variants = queryVariants(query, { forPackages: true });
  if (variants.length === 0) return [];

  const scored: { result: ProfileSearchResult; score: number }[] = [];
  for (const result of catalog.profiles) {
    const codeNorm = normalizeQuery(result.code);
    const nameNorm = normalizeQuery(result.name);
    const score = Math.max(
      ...variants.map((variant, i) => {
        const variantScore =
          variant === codeNorm || variant === nameNorm
            ? 100
            : Math.max(matchScore(variant, codeNorm), matchScore(variant, nameNorm)) * 100;
        return i === 0 ? variantScore : variantScore * VARIANT_SCORE_FACTOR;
      })
    );
    if (score >= FUZZY_THRESHOLD * 100) scored.push({ result, score });
  }
  scored.sort((a, b) => b.score - a.score);

  // Profiles containing the test/parameter the query names, even when their
  // own name doesn't match it ("platelet count" -> the Hemogram).
  const testById = new Map(catalog.tests.map((test) => [test.id, test]));
  const containedTestIds = rankResults(
    queryVariants(query).flatMap((variant) => buildSearchCandidates(variant, catalog.tests, catalog.aliases))
  )
    .filter((candidate) => candidate.matchType === "exact" || candidate.exact || candidate.score >= CONTAINED_TEST_MIN_SCORE)
    .slice(0, MAX_CONTAINED_TESTS)
    .map((candidate) => candidate.testId);
  const nameMatched = new Set(scored.map(({ result }) => result.profileId));
  const containing = catalog.profiles
    .flatMap((result) => {
      if (nameMatched.has(result.profileId)) return [];
      const testId = containedTestIds.find((id) => result.tests.some((test) => test.testId === id));
      const test = testId ? testById.get(testId) : undefined;
      if (!test) return [];
      const includedTest: ProfileTestSummary = { testId: test.id, code: test.code, officialName: test.officialName };
      return [{ ...result, includedTest, nameScore: null }];
    })
    .sort((a, b) => a.tests.length - b.tests.length);

  return dedupeProfilesByName([
    ...scored.map(({ result, score }) => ({ ...result, includedTest: null, nameScore: Math.round(score) })),
    ...containing,
  ]).slice(0, MAX_RESULTS);
}
