import "server-only";
import { listActiveTests } from "@/lib/database/tests";
import { listActiveAliases } from "@/lib/database/aliases";
import { getCurrentPrices } from "@/lib/database/prices";
import { normalizeQuery } from "./normalize-query";
import { fuzzyMatch } from "./fuzzy-match";
import { rankResults, type SearchCandidate } from "./rank-results";
import type { ServiceType } from "@/lib/constants/service-types";
import type { SearchTestResult } from "@/types/search";

/** Below this Jaccard trigram score, a fuzzy candidate is noise, not a real typo-tolerant match. */
const FUZZY_THRESHOLD = 0.3;

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
  const normalized = normalizeQuery(query);
  if (!normalized) return [];

  const [tests, aliases] = await Promise.all([listActiveTests(), listActiveAliases()]);

  const candidates: SearchCandidate[] = [];

  for (const test of tests) {
    const codeNorm = normalizeQuery(test.code);
    const nameNorm = normalizeQuery(test.officialName);
    const shortNorm = test.shortName ? normalizeQuery(test.shortName) : "";

    if (normalized === codeNorm || normalized === nameNorm || (shortNorm && normalized === shortNorm)) {
      candidates.push({ testId: test.id, matchType: "exact", score: 100 });
      continue;
    }

    const fuzzyScores = [fuzzyMatch(normalized, codeNorm), fuzzyMatch(normalized, nameNorm)];
    if (shortNorm) fuzzyScores.push(fuzzyMatch(normalized, shortNorm));
    const best = Math.max(...fuzzyScores);
    if (best >= FUZZY_THRESHOLD) {
      candidates.push({ testId: test.id, matchType: "fuzzy", score: best * 100 });
    }
  }

  for (const alias of aliases) {
    if (normalized === alias.normalizedAlias) {
      candidates.push({
        testId: alias.testId,
        matchType: "alias",
        score: alias.confidence,
        matchedAlias: alias.alias,
      });
      continue;
    }

    const similarity = fuzzyMatch(normalized, alias.normalizedAlias);
    if (similarity >= FUZZY_THRESHOLD) {
      candidates.push({
        testId: alias.testId,
        matchType: "alias",
        score: similarity * alias.confidence,
        matchedAlias: alias.alias,
      });
    }
  }

  const ranked = rankResults(candidates).slice(0, MAX_RESULTS);
  if (ranked.length === 0) return [];

  const testById = new Map(tests.map((test) => [test.id, test]));
  const prices = await getCurrentPrices(
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

    results.push({
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
    });
  }

  return results;
}
