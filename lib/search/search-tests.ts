import "server-only";
import { listActiveTests } from "@/lib/database/tests";
import { listActiveAliases } from "@/lib/database/aliases";
import { getCurrentPricesForSearch } from "@/lib/database/prices";
import { queryVariants, VARIANT_SCORE_FACTOR } from "./query-variants";
import { buildSearchCandidates } from "./build-search-candidates";
import { rankResults } from "./rank-results";
import { segmentTestNames } from "./segment-tests";
import type { ServiceType } from "@/lib/constants/service-types";
import type { SearchCandidate } from "./rank-results";
import type { Test } from "@/types/test";
import type { TestPrice } from "@/types/price";
import type { SearchTestResult } from "@/types/search";

/** Cap on how many ranked candidates get priced/returned per search. */
const MAX_RESULTS = 20;

/**
 * Main entry point: alias lookup + fuzzy ranking against the test catalog,
 * joined to real pricing for the requested location + service type.
 *
 * 1. Check test_aliases for a match against the query (admin-curated, e.g.
 *    "insulin resistance" -> Insulin PP).
 * 2. Trigram similarity against test code/official_name/short_name and
 *    alias text, for typo tolerance.
 * 3. Rank: exact code/name/alias match > alias fuzzy match > catalog fuzzy match.
 * 4. Join to test_prices for the selected location + service type; only
 *    tests with a current price row there are returned — real DB rows only,
 *    never generated text.
 */
export async function searchTests(
  query: string,
  locationId: string,
  serviceType: ServiceType
): Promise<SearchTestResult[]> {
  const variants = queryVariants(query);
  if (variants.length === 0) return [];

  const [tests, aliases] = await Promise.all([listActiveTests(), listActiveAliases()]);

  // The query as typed, plus its plain-words phrasings ("I need thyroid
  // test" -> "thyroid", "sugar" -> "glucose"); a match found only through a
  // rephrasing scores slightly below the same match on the original.
  const candidates = variants.flatMap((variant, i) => {
    const found = buildSearchCandidates(variant, tests, aliases);
    return i === 0 ? found : found.map((candidate) => ({ ...candidate, score: candidate.score * VARIANT_SCORE_FACTOR }));
  });
  const ranked = rankResults(candidates).slice(0, MAX_RESULTS);
  if (ranked.length === 0) return [];

  const testById = new Map(tests.map((test) => [test.id, test]));
  const prices = await getCurrentPricesForSearch(
    ranked.map((candidate) => candidate.testId),
    locationId,
    serviceType
  );
  const priceByTestId = new Map(prices.map((price) => [price.testId, price]));

  const results: SearchTestResult[] = [];
  for (const candidate of ranked) {
    const test = testById.get(candidate.testId);
    const price = priceByTestId.get(candidate.testId);
    // A matched test with no current price at this location/service type
    // isn't shown — never backfilled with placeholder data.
    if (!test || !price) continue;

    results.push(toSearchResult(test, candidate, price));
  }

  return results;
}

/**
 * True when a search-box query with no commas/line breaks still names
 * several tests ("TSH T3 T4", "hba1c vitamin d cbc") — the workspace then
 * reads it like a pasted list instead of one fuzzy search.
 */
export async function queryNamesSeveralTests(query: string): Promise<boolean> {
  if (!query.trim().includes(" ")) return false;
  const [tests, aliases] = await Promise.all([listActiveTests(), listActiveAliases()]);
  return segmentTestNames(query.trim(), tests, aliases) !== null;
}

/** A ranked candidate joined to its test + current price row — the shape the workspace renders. */
export function toSearchResult(test: Test, candidate: SearchCandidate, price: TestPrice): SearchTestResult {
  return {
    testId: test.id,
    code: test.code,
    officialName: test.officialName,
    shortName: test.shortName,
    category: test.category,
    matchType: candidate.matchType,
    matchedAlias: candidate.matchedAlias ?? null,
    price: { amount: price.price, currency: price.currencyCode },
    tatText: price.tatText,
    availability: price.availability,
    serviceType: price.serviceType,
  };
}
