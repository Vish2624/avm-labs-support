import { normalizeQuery } from "./normalize-query";
import { fuzzyMatch } from "./fuzzy-match";
import type { SearchCandidate } from "./rank-results";
import type { Test, TestAlias } from "@/types/test";

/** Below this Jaccard trigram score, a fuzzy candidate is noise, not a real typo-tolerant match. */
export const FUZZY_THRESHOLD = 0.3;

/**
 * Generates ranked-search candidates for a (pre-normalized) query against
 * the test catalog and its aliases: exact code/name/short-name match, fuzzy
 * catalog match, exact/fuzzy alias match. Pure — no DB access. Shared by
 * searchTests() (joins to price) and resolveTestIds() (doesn't).
 */
export function buildSearchCandidates(
  normalizedQuery: string,
  tests: Test[],
  aliases: TestAlias[]
): SearchCandidate[] {
  const candidates: SearchCandidate[] = [];

  for (const test of tests) {
    const codeNorm = normalizeQuery(test.code);
    const nameNorm = normalizeQuery(test.officialName);
    const shortNorm = test.shortName ? normalizeQuery(test.shortName) : "";

    if (normalizedQuery === codeNorm || normalizedQuery === nameNorm || (shortNorm && normalizedQuery === shortNorm)) {
      candidates.push({ testId: test.id, matchType: "exact", score: 100 });
      continue;
    }

    const fuzzyScores = [fuzzyMatch(normalizedQuery, codeNorm), fuzzyMatch(normalizedQuery, nameNorm)];
    if (shortNorm) fuzzyScores.push(fuzzyMatch(normalizedQuery, shortNorm));
    const best = Math.max(...fuzzyScores);
    if (best >= FUZZY_THRESHOLD) {
      candidates.push({ testId: test.id, matchType: "fuzzy", score: best * 100 });
    }
  }

  for (const alias of aliases) {
    if (normalizedQuery === alias.normalizedAlias) {
      candidates.push({
        testId: alias.testId,
        matchType: "alias",
        score: alias.confidence,
        matchedAlias: alias.alias,
      });
      continue;
    }

    const similarity = fuzzyMatch(normalizedQuery, alias.normalizedAlias);
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
