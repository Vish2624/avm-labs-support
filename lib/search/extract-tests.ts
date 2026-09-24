import "server-only";
import { listActiveTests } from "@/lib/database/tests";
import { listActiveAliases } from "@/lib/database/aliases";
import { getCurrentPrices } from "@/lib/database/prices";
import { normalizeQuery } from "./normalize-query";
import { buildSearchCandidates } from "./build-search-candidates";
import { rankResults, type SearchCandidate } from "./rank-results";
import { splitTestList } from "./split-test-list";
import { toSearchResult } from "./search-tests";
import type { ServiceType } from "@/lib/constants/service-types";
import type { TestPrice } from "@/types/price";
import type { SearchTestResult } from "@/types/search";

/** Hard cap on tokens read from one message — a full panel is ~50 tests. */
const MAX_TOKENS = 150;
/** How many ranked candidates per token are tried against the price join. */
const CANDIDATES_PER_TOKEN = 5;
/** Keeps each price query's `in (...)` list (and its URL) a sane size. */
const PRICE_CHUNK_SIZE = 150;

/** Below this 0-100 score a no-price fuzzy guess isn't named back to the agent as "the test they meant". */
const CONFIDENT_SCORE = 70;

export interface NotOfferedTest {
  /** The text as the customer wrote it. */
  token: string;
  code: string;
  officialName: string;
}

export interface ExtractTestsResult {
  detected: SearchTestResult[];
  /** Real catalog tests with no current price at this location/service type. */
  notOffered: NotOfferedTest[];
  /** Tokens that don't match any test in the catalog, as typed. */
  unmatched: string[];
}

/**
 * Reads every test named in a free-text list or customer message — "ACCP,
 * ALKP, AMYL", one per line, "Test Required : TSH, T3" — through the same
 * alias/fuzzy matcher as searchTests(), in one pass: the catalog and
 * aliases load once and prices join in bulk, instead of one /api/search
 * round-trip per token.
 *
 * Each token keeps its best-ranked match that has a current price at this
 * location, trying `serviceTypes` in order (so "All" prefers in-house and
 * falls back to outsourced). A multi-word token that matches nothing as a
 * whole ("TSH T3 T4") is retried word by word, accepting exact matches only.
 */
export async function extractTests(
  text: string,
  locationId: string,
  serviceTypes: readonly ServiceType[]
): Promise<ExtractTestsResult> {
  const tokens = splitTestList(text).slice(0, MAX_TOKENS);
  if (tokens.length === 0) return { detected: [], notOffered: [], unmatched: [] };

  const [tests, aliases] = await Promise.all([listActiveTests(), listActiveAliases()]);
  const testById = new Map(tests.map((test) => [test.id, test]));

  const rank = (query: string) => {
    const normalized = normalizeQuery(query);
    return normalized ? rankResults(buildSearchCandidates(normalized, tests, aliases)) : [];
  };
  const isExact = (candidate: SearchCandidate) => candidate.matchType === "exact" || Boolean(candidate.exact);

  // Each "mention" is a list of ranked candidates to try, tagged with the
  // token it came from so unmatched tokens can be reported back as typed.
  const mentions: { token: string; candidates: SearchCandidate[] }[] = [];
  for (const token of tokens) {
    const ranked = rank(token);
    const words = token.split(/\s+/);
    if (ranked.length === 0 && words.length > 1) {
      for (const word of words) {
        const exact = rank(word).filter(isExact);
        mentions.push({ token: word, candidates: exact.slice(0, CANDIDATES_PER_TOKEN) });
      }
    } else {
      // An exact code/name/alias hit is the test they asked for — if it has
      // no price here, report it as not offered rather than substituting a
      // different, merely similar test that does.
      const exact = ranked.filter(isExact);
      mentions.push({ token, candidates: (exact.length > 0 ? exact : ranked).slice(0, CANDIDATES_PER_TOKEN) });
    }
  }

  const candidateIds = [...new Set(mentions.flatMap((mention) => mention.candidates.map((c) => c.testId)))];
  const priceByType = new Map<ServiceType, Map<string, TestPrice>>();
  await Promise.all(
    serviceTypes.map(async (serviceType) => {
      const chunks: string[][] = [];
      for (let i = 0; i < candidateIds.length; i += PRICE_CHUNK_SIZE) {
        chunks.push(candidateIds.slice(i, i + PRICE_CHUNK_SIZE));
      }
      const prices = (await Promise.all(chunks.map((ids) => getCurrentPrices(ids, locationId, serviceType)))).flat();
      priceByType.set(serviceType, new Map(prices.map((price) => [price.testId, price])));
    })
  );

  const detected: SearchTestResult[] = [];
  const notOffered: NotOfferedTest[] = [];
  const unmatched: string[] = [];
  const detectedIds = new Set<string>();
  const notOfferedIds = new Set<string>();

  for (const mention of mentions) {
    let found: SearchTestResult | null = null;
    for (const candidate of mention.candidates) {
      const test = testById.get(candidate.testId);
      if (!test) continue;
      for (const serviceType of serviceTypes) {
        // Only real price rows — a test not carried here is never shown with placeholder data.
        const price = priceByType.get(serviceType)?.get(candidate.testId);
        if (price) {
          found = toSearchResult(test, candidate, price);
          break;
        }
      }
      if (found) break;
    }

    if (!found) {
      // Name the catalog test only when the match is confident — a loose
      // fuzzy guess would tell the agent the wrong test isn't offered.
      const best = mention.candidates[0];
      const test = best && (isExact(best) || best.score >= CONFIDENT_SCORE) ? testById.get(best.testId) : undefined;
      if (!test) unmatched.push(mention.token);
      else if (!notOfferedIds.has(test.id)) {
        notOfferedIds.add(test.id);
        notOffered.push({ token: mention.token, code: test.code, officialName: test.officialName });
      }
    } else if (!detectedIds.has(found.testId)) {
      detectedIds.add(found.testId);
      detected.push(found);
    }
  }

  return { detected, notOffered, unmatched };
}
