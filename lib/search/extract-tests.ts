import "server-only";
import { listActiveTests } from "@/lib/database/tests";
import { listActiveAliases } from "@/lib/database/aliases";
import { listActiveProfilesWithTests } from "@/lib/database/profiles";
import { getCurrentPricesForSearch } from "@/lib/database/prices";
import { normalizeQuery } from "./normalize-query";
import { buildSearchCandidates } from "./build-search-candidates";
import { rankResults, type SearchCandidate } from "./rank-results";
import { splitTestList } from "./split-test-list";
import { segmentTestNames } from "./segment-tests";
import { toSearchResult } from "./search-tests";
import { searchProfilesByName } from "@/lib/profiles/search-profiles-by-name";
import type { ProfileSearchResult } from "@/types/profile";
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
/**
 * A package whose own name matches a message name at least this well
 * (0-100, same scoring as the search box's package search) is what the
 * customer asked for, unless a test's code/name/alias matched exactly —
 * "diabetes package", "thyroid profile", "women package".
 */
const PACKAGE_NAME_SCORE = 85;
/** At this package-name score the package wins even over an exact alias ("lipid profile" is the LIPID package, not the Triglycerides test). */
const PACKAGE_OVER_ALIAS_SCORE = 95;
/** Packages within this many points of the best one count as an equally good match. */
const PACKAGE_TIE_MARGIN = 2;
const MAX_TIED_PACKAGES = 3;

export interface NotOfferedTest {
  /** The text as the customer wrote it. */
  token: string;
  code: string;
  officialName: string;
}

export interface ExtractTestsResult {
  detected: SearchTestResult[];
  /** Packages named in the message, matched by package name like the search box does. */
  packages: { token: string; result: ProfileSearchResult }[];
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
 * falls back to outsourced). Tests separated only by spaces ("TSH T3 T4",
 * "cbc esr crp") are split into one per test (see segmentTestNames()).
 */
export async function extractTests(
  text: string,
  locationId: string,
  serviceTypes: readonly ServiceType[]
): Promise<ExtractTestsResult> {
  const tokens = splitTestList(text).slice(0, MAX_TOKENS);
  if (tokens.length === 0) return { detected: [], packages: [], notOffered: [], unmatched: [] };

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
  // Tests typed with only spaces between them ("hba1c lipid profile
  // vitamin d", "TSH T3 T4") are split into one piece per test first.
  const packageNames = (await listActiveProfilesWithTests()).map(({ profile }) => profile);
  const pieces = tokens.flatMap((token) => segmentTestNames(token, tests, aliases, packageNames) ?? [token]);

  // Packages are matched by name exactly like the search box ("All" lists
  // in-house packages); only a strong package-name hit counts.
  const packageServiceType = serviceTypes.length > 1 ? "in_house" : serviceTypes[0];
  const packages: ExtractTestsResult["packages"] = [];
  const packageIds = new Set<string>();

  for (const token of pieces) {
    // An exact code/name/alias hit is the test they asked for — if it has
    // no price here, report it as not offered rather than substituting a
    // different, merely similar test that does.
    const ranked = rank(token);
    const exact = ranked.filter(isExact);

    // …unless the name is really a package's ("lipid profile", "kidney
    // function test", "diabetes package"): then the package wins over a
    // loosely matching test, and even over an exact alias when the
    // package name matches near-perfectly. An exact test code/name still wins.
    const namedPackages = (await searchProfilesByName(token, locationId, packageServiceType)).filter(
      (result) => result.includedTest === null && (result.nameScore ?? 0) >= PACKAGE_NAME_SCORE
    );
    const bestPackage = namedPackages[0];
    const exactTestName = exact.some((candidate) => candidate.matchType === "exact");
    const packageWins =
      bestPackage &&
      !exactTestName &&
      (exact.length === 0 || (bestPackage.nameScore ?? 0) >= PACKAGE_OVER_ALIAS_SCORE);
    if (bestPackage && packageWins) {
      // Several packages matching equally well ("women package") are all
      // shown for the agent to choose — never one picked silently.
      const tied = namedPackages
        .filter((result) => (bestPackage.nameScore ?? 0) - (result.nameScore ?? 0) <= PACKAGE_TIE_MARGIN)
        .slice(0, MAX_TIED_PACKAGES);
      for (const result of tied) {
        if (packageIds.has(result.profileId)) continue;
        packageIds.add(result.profileId);
        packages.push({ token, result });
      }
      continue;
    }

    mentions.push({ token, candidates: (exact.length > 0 ? exact : ranked).slice(0, CANDIDATES_PER_TOKEN) });
  }

  const candidateIds = [...new Set(mentions.flatMap((mention) => mention.candidates.map((c) => c.testId)))];
  const priceByType = new Map<ServiceType, Map<string, TestPrice>>();
  await Promise.all(
    serviceTypes.map(async (serviceType) => {
      const chunks: string[][] = [];
      for (let i = 0; i < candidateIds.length; i += PRICE_CHUNK_SIZE) {
        chunks.push(candidateIds.slice(i, i + PRICE_CHUNK_SIZE));
      }
      const prices = (await Promise.all(chunks.map((ids) => getCurrentPricesForSearch(ids, locationId, serviceType)))).flat();
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

  return { detected, packages, notOffered, unmatched };
}
