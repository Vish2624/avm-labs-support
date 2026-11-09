import { normalizeQuery } from "../matching/normalize-query";
import { matchScore } from "../matching/fuzzy-match";
import { FUZZY_THRESHOLD, buildSearchCandidates, type SearchableAlias, type SearchableTest } from "../matching/build-search-candidates";
import { rankResults, type SearchCandidate } from "../matching/rank-results";
import { queryVariants, VARIANT_SCORE_FACTOR } from "../matching/query-variants";
import { dedupeProfilesByName } from "@/lib/profiles/dedupe-profiles";
import type { CalculatedSearchResult, SearchTestResult } from "@/types/search";
import type { ProfileSearchResult, ProfileTestSummary } from "@/types/profile";

/**
 * A calculated parameter as the browser gets it: never priced itself — it
 * points at the tests to order. `orderTestIds` is already flattened, so a
 * source that is itself calculated (A/G Ratio -> Serum Globulin) is replaced
 * by its own sources (Total Protein + Albumin).
 */
export interface CatalogCalculatedParameter {
  id: string;
  code: string;
  officialName: string;
  shortName: string | null;
  /** Extra note from the master, e.g. a source test that isn't in the price list. */
  description: string | null;
  /** The direct sources' names, as the master lists them. */
  sourceNames: string[];
  /** The orderable tests behind it, in order. */
  orderTestIds: string[];
  /** Only orderable within this profile (its code), e.g. eGFR -> KFT; null = add its own tests. */
  viaProfileCode: string | null;
}

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
  /** Calculated parameters (never priced) — a match suggests the tests to order. */
  calculated: CatalogCalculatedParameter[];
}

/** Cap on how many ranked matches are returned per search (same as the server). */
const MAX_RESULTS = 20;
/** Calculated parameters shown for one search — a hint alongside the tests, not a list. */
const MAX_CALCULATED_RESULTS = 3;
/** A calculated parameter only shows for a close name match (0-100), so "cholesterol" doesn't list every lipid ratio. */
const CALCULATED_MIN_SCORE = 60;

/**
 * Calculated parameters matching the query by name/code/short name, each
 * with the tests to order for it, priced here. A source with no price here
 * is listed by name in `unpricedSources`, never priced or left out silently.
 */
export function searchCatalogCalculated(
  query: string,
  catalog: SearchCatalog,
  { minScore = CALCULATED_MIN_SCORE }: { minScore?: number } = {}
): CalculatedSearchResult[] {
  const variants = queryVariants(query);
  if (variants.length === 0 || catalog.calculated.length === 0) return [];
  const pricedById = new Map(catalog.priced.map((result) => [result.testId, result]));
  const nameById = new Map(catalog.tests.map((test) => [test.id, test.officialName]));
  const byId = new Map(catalog.calculated.map((calc) => [calc.id, calc]));

  const candidates = variants.flatMap((variant, i) => {
    const found = buildSearchCandidates(variant, catalog.calculated, []);
    return i === 0 ? found : found.map((candidate) => ({ ...candidate, score: candidate.score * VARIANT_SCORE_FACTOR }));
  });

  return rankResults(candidates)
    .filter((candidate) => candidate.matchType === "exact" || candidate.score >= minScore)
    .slice(0, MAX_CALCULATED_RESULTS)
    .flatMap((candidate) => {
      const calc = byId.get(candidate.testId);
      if (!calc) return [];
      const sources = calc.orderTestIds.flatMap((id) => pricedById.get(id) ?? []);
      const unpricedSources = calc.orderTestIds.filter((id) => !pricedById.has(id)).map((id) => nameById.get(id) ?? id);
      return [
        {
          testId: calc.id,
          code: calc.code,
          officialName: calc.officialName,
          shortName: calc.shortName,
          description: calc.description,
          sourceNames: calc.sourceNames,
          sources,
          unpricedSources,
          exact: candidate.matchType === "exact",
          viaProfileCode: calc.viaProfileCode,
          viaProfile: calc.viaProfileCode
            ? (catalog.profiles.find((p) => p.code.toUpperCase() === calc.viaProfileCode!.toUpperCase()) ?? null)
            : null,
        },
      ];
    });
}
/** A test the query resolves to only counts toward "profiles containing it" at or above this score. */
const CONTAINED_TEST_MIN_SCORE = 80;
/** How many of the query's best test matches are looked up inside profiles. */
const MAX_CONTAINED_TESTS = 3;

// Matching every test and alias is the expensive step of a search, and each
// keystroke needs it twice (the tests list, and "profiles containing this
// test") — so a catalog's candidates per query phrasing are kept for reuse.
// Bounded per catalog; a refreshed catalog is a new object, so stale
// entries go with the old one.
const CANDIDATE_CACHE_LIMIT = 300;
const candidateCache = new WeakMap<SearchableTest[], Map<string, SearchCandidate[]>>();

function testCandidates(variant: string, catalog: SearchCatalog): SearchCandidate[] {
  let byVariant = candidateCache.get(catalog.tests);
  if (!byVariant) {
    byVariant = new Map();
    candidateCache.set(catalog.tests, byVariant);
  }
  const cached = byVariant.get(variant);
  if (cached) return cached;
  if (byVariant.size >= CANDIDATE_CACHE_LIMIT) byVariant.clear();
  const found = buildSearchCandidates(variant, catalog.tests, catalog.aliases);
  byVariant.set(variant, found);
  return found;
}

/** Tests matching the query, best first — searchTests(), run on the loaded catalog. */
export function searchCatalogTests(query: string, catalog: SearchCatalog): SearchTestResult[] {
  const variants = queryVariants(query);
  if (variants.length === 0) return [];
  const pricedById = new Map(catalog.priced.map((result) => [result.testId, result]));

  const candidates = variants.flatMap((variant, i) => {
    const found = testCandidates(variant, catalog);
    return i === 0 ? found : found.map((candidate) => ({ ...candidate, score: candidate.score * VARIANT_SCORE_FACTOR }));
  });

  const results: SearchTestResult[] = [];
  for (const candidate of rankResults(candidates)) {
    const priced = pricedById.get(candidate.testId);
    // A matched test with no current price here isn't shown — never backfilled.
    if (!priced) continue;
    results.push({
      ...priced,
      matchType: candidate.matchType,
      matchedAlias: candidate.matchedAlias ?? null,
      includedParameter: candidate.includedParameter ?? null,
    });
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
    queryVariants(query).flatMap((variant) => testCandidates(variant, catalog))
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
