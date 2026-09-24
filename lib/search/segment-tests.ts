import { normalizeQuery } from "./normalize-query";
import { buildSearchCandidates } from "./build-search-candidates";
import { rankResults } from "./rank-results";
import type { Test, TestAlias } from "@/types/test";

/** Longest run of words tried as one test name ("thyroid stimulating hormone"). */
const MAX_SPAN_WORDS = 3;
/** Longer runs aren't a list typed without separators; leave them alone. */
const MAX_WORDS = 20;
/**
 * A piece only counts as a test when it (nearly) exactly names one — code,
 * name or alias. Looser matches let one common word pose as a test
 * ("liver" -> Liver Kidney Microsomes).
 */
const STRONG_SCORE = 95;
/** Splitting must beat reading the whole run as one test by at least this much. */
const SPLIT_MARGIN = 5;
/** Joining words between tests that name none themselves. */
const SKIPPABLE = new Set(["and", "test", "tests", "plus", "with", "also", "or", "&"]);

/**
 * Splits a run of words that names several tests with no commas or line
 * breaks — "hba1c lipid profile vitamin d", "cbc esr crp" — into one piece
 * per test. Pure — no DB access.
 *
 * Every word must land in a strong match (or be a joining word like
 * "and"); a single familiar word inside an unknown name never splits it
 * ("Anti Zinc transporter 8" is not Zinc). And the split must clearly beat
 * reading the whole run as one test, so real multi-word names such as
 * "Thyroid Stimulating Hormone" stay whole. Returns null when it shouldn't
 * be split.
 */
export function segmentTestNames(text: string, tests: Test[], aliases: TestAlias[]): string[] | null {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > MAX_WORDS) return null;

  const scores = new Map<string, number>();
  const score = (phrase: string): number => {
    const cached = scores.get(phrase);
    if (cached !== undefined) return cached;
    const normalized = normalizeQuery(phrase);
    const [top] = normalized ? rankResults(buildSearchCandidates(normalized, tests, aliases)) : [];
    const value = !top ? 0 : top.matchType === "exact" || top.exact ? 100 : top.score;
    scores.set(phrase, value);
    return value;
  };

  const whole = score(text);
  if (whole >= 100) return null;

  // best[i]: fewest pieces covering words[0..i), ties going to the higher total score.
  const best: ({ pieces: string[]; total: number } | null)[] = [{ pieces: [], total: 0 }];
  const better = (a: { pieces: string[]; total: number }, b: { pieces: string[]; total: number } | null) =>
    !b || a.pieces.length < b.pieces.length || (a.pieces.length === b.pieces.length && a.total > b.total);

  for (let end = 1; end <= words.length; end++) {
    let chosen: { pieces: string[]; total: number } | null = null;

    const previous = best[end - 1];
    if (previous && SKIPPABLE.has(words[end - 1].toLowerCase())) chosen = previous;

    for (let start = Math.max(0, end - MAX_SPAN_WORDS); start < end; start++) {
      const before = best[start];
      if (!before) continue;
      const phrase = words.slice(start, end).join(" ");
      const phraseScore = score(phrase);
      if (phraseScore < STRONG_SCORE) continue;
      const option = { pieces: [...before.pieces, phrase], total: before.total + phraseScore };
      if (better(option, chosen)) chosen = option;
    }
    best.push(chosen);
  }

  const result = best[words.length];
  if (!result || result.pieces.length < 2) return null;
  const average = result.total / result.pieces.length;
  return average >= whole + SPLIT_MARGIN ? result.pieces : null;
}
