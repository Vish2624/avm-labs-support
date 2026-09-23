import { normalizeQuery } from "./normalize-query";
import { matchScore } from "./fuzzy-match";
import type { SearchCandidate } from "./rank-results";
import type { Test, TestAlias } from "@/types/test";

/** Below this matchScore(), a fuzzy candidate is noise, not a real typo-tolerant match. */
export const FUZZY_THRESHOLD = 0.45;

const compact = (value: string) => value.replace(/\s+/g, "");

/**
 * Generates ranked-search candidates for a (pre-normalized) query against
 * the test catalog and its aliases: exact code/name/short-name/alias match
 * (spacing-insensitive, so "hb a1c" = "HbA1c"), then typo-tolerant fuzzy
 * matches (see matchScore()). Pure — no DB access. Shared by searchTests()
 * (joins to price) and resolveTestIds() (doesn't).
 */
export function buildSearchCandidates(
  normalizedQuery: string,
  tests: Test[],
  aliases: TestAlias[]
): SearchCandidate[] {
  const candidates: SearchCandidate[] = [];
  const queryCompact = compact(normalizedQuery);

  for (const test of tests) {
    const fields = [normalizeQuery(test.code), normalizeQuery(test.officialName)];
    if (test.shortName) fields.push(normalizeQuery(test.shortName));

    if (fields.some((field) => field && compact(field) === queryCompact)) {
      candidates.push({ testId: test.id, matchType: "exact", score: 100 });
      continue;
    }

    const best = Math.max(...fields.map((field) => matchScore(normalizedQuery, field)));
    if (best >= FUZZY_THRESHOLD) {
      candidates.push({ testId: test.id, matchType: "fuzzy", score: best * 100 });
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
