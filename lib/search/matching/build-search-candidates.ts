import { normalizeQuery } from "./normalize-query";
import { matchScore } from "./fuzzy-match";
import type { SearchCandidate } from "./rank-results";
import type { Test, TestAlias } from "@/types/test";

/**
 * The only test fields matching reads — full Test rows fit, and so does the
 * browser's slimmed-down catalog. `componentIds` (set on a parameter) sends
 * its matches to the component(s) it's part of.
 */
export type SearchableTest = Pick<Test, "id" | "code" | "officialName" | "shortName"> & Partial<Pick<Test, "componentIds">>;
/** The only alias fields matching reads. */
export type SearchableAlias = Pick<TestAlias, "testId" | "alias" | "normalizedAlias" | "confidence">;

/** Below this matchScore(), a fuzzy candidate is noise, not a real typo-tolerant match. */
export const FUZZY_THRESHOLD = 0.45;

/** How much a non-exact parameter match is discounted against a direct test match. */
const PARAMETER_SCORE_FACTOR = 0.9;

const compact = (value: string) => value.replace(/\s+/g, "");

// A test's normalized code/name/short name (and their spaceless forms) are
// the same on every keystroke, so they're worked out once per test object.
const preparedCache = new WeakMap<SearchableTest, { fields: string[]; compacts: string[] }>();

function preparedFields(test: SearchableTest) {
  let prepared = preparedCache.get(test);
  if (!prepared) {
    const fields = [normalizeQuery(test.code), normalizeQuery(test.officialName)];
    if (test.shortName) fields.push(normalizeQuery(test.shortName));
    prepared = { fields, compacts: fields.map(compact) };
    preparedCache.set(test, prepared);
  }
  return prepared;
}

/**
 * Generates ranked-search candidates for a (pre-normalized) query against
 * the test catalog and its aliases: exact code/name/short-name/alias match
 * (spacing-insensitive, so "hb a1c" = "HbA1c"), then typo-tolerant fuzzy
 * matches (see matchScore()). A parameter never stands on its own — a
 * match on one ("hemoglobin") is a match on the component it's part of (H6),
 * the way an alias is. Pure — no DB access. Shared by searchTests() (joins to
 * price) and resolveTestIds() (doesn't).
 */
export function buildSearchCandidates(
  normalizedQuery: string,
  tests: SearchableTest[],
  aliases: SearchableAlias[]
): SearchCandidate[] {
  const candidates: SearchCandidate[] = [];
  const queryCompact = compact(normalizedQuery);

  for (const test of tests) {
    const { fields, compacts } = preparedFields(test);
    const exact = compacts.some((field) => field && field === queryCompact);
    const score = exact ? 100 : Math.max(...fields.map((field) => matchScore(normalizedQuery, field))) * 100;

    if (test.componentIds && test.componentIds.length > 0) {
      if (!exact && score < FUZZY_THRESHOLD * 100) continue;
      for (const componentId of test.componentIds) {
        candidates.push({
          testId: componentId,
          matchType: "alias",
          exact,
          // A loose hit on a parameter ranks just below an equally close hit
          // on a test itself: "bilirubin" is Total Bilirubin, not the urine
          // panel's "Urinary Bilirubin"; "sugar" is blood sugar, not "Urinary Glucose".
          score: exact ? score : score * PARAMETER_SCORE_FACTOR,
          matchedAlias: test.officialName,
          includedParameter: test.officialName,
        });
      }
      continue;
    }

    if (exact) {
      candidates.push({ testId: test.id, matchType: "exact", score: 100 });
    } else if (score >= FUZZY_THRESHOLD * 100) {
      candidates.push({ testId: test.id, matchType: "fuzzy", score });
    }
  }

  for (const alias of aliases) {
    if (compact(alias.normalizedAlias) === queryCompact) {
      candidates.push({
        testId: alias.testId,
        matchType: "alias",
        exact: true,
        score: alias.confidence,
        matchedAlias: alias.alias,
      });
      continue;
    }

    const similarity = matchScore(normalizedQuery, alias.normalizedAlias);
    if (similarity >= FUZZY_THRESHOLD) {
      candidates.push({
        testId: alias.testId,
        matchType: "alias",
        score: similarity * alias.confidence,
        matchedAlias: alias.alias,
      });
    }
  }

  return candidates;
}
