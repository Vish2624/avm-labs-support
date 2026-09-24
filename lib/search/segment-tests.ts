import { normalizeQuery } from "./normalize-query";
import { buildSearchCandidates } from "./build-search-candidates";
import { rankResults } from "./rank-results";
import { matchScore } from "./fuzzy-match";
import { queryVariants, VARIANT_SCORE_FACTOR } from "./query-variants";
import type { Test, TestAlias } from "@/types/test";

/** A package's code + name, for scoring words against package names. */
export interface PackageName {
  code: string;
  name: string;
}

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
/**
 * When the whole run matches nothing (below LOOSE_WHOLE_MAX), a piece may
 * also be a strong-but-not-exact match to a test or a package name —
 * "hba vitamin thyroid" -> HbA1c + Vitamin Profile + Thyroid profiles.
 * Every word must still be covered, so an unknown name never splits on one
 * familiar word.
 */
const LOOSE_PIECE_SCORE = 85;
const LOOSE_WHOLE_MAX = 70;
/**
 * Words that describe a kind of test or bundle rather than name one. On a
 * loose split, a piece made only of these can't stand alone — otherwise
 * "female health package" splits into "female" + "health package", and
 * "thyroid function test" gives "function" -> Kidney Function Tests.
 */
const DESCRIPTOR_WORDS = new Set([
  "function", "functions", "test", "tests", "package", "packages", "profile", "profiles", "panel", "check", "checkup",
  "health", "wellness", "female", "male", "women", "woman", "men", "man", "ladies", "blood", "serum", "urine", "level",
  "levels", "count", "total", "free", "routine", "complete", "basic", "standard", "premium", "advanced", "general",
  "full", "body", "screening", "marker", "markers",
]);
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
export function segmentTestNames(
  text: string,
  tests: Test[],
  aliases: TestAlias[],
  packages: PackageName[] = []
): string[] | null {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > MAX_WORDS) return null;

  const scores = new Map<string, number>();
  const score = (phrase: string): number => {
    const cached = scores.get(phrase);
    if (cached !== undefined) return cached;
    const normalized = normalizeQuery(phrase);
    const [top] = normalized ? rankResults(buildSearchCandidates(normalized, tests, aliases)) : [];
    const testScore = !top ? 0 : top.matchType === "exact" || top.exact ? 100 : top.score;
    const value = Math.max(testScore, packageScore(phrase));
    scores.set(phrase, value);
    return value;
  };

  // Same package-name scoring as the search box (search-profiles-by-name.ts).
  const packageScore = (phrase: string): number => {
    if (packages.length === 0) return 0;
    const variants = queryVariants(phrase, { forPackages: true });
    let best = 0;
    for (const { code, name } of packages) {
      const codeNorm = normalizeQuery(code);
      const nameNorm = normalizeQuery(name);
      variants.forEach((variant, i) => {
        const raw =
          variant === codeNorm || variant === nameNorm ? 100 : Math.max(matchScore(variant, codeNorm), matchScore(variant, nameNorm)) * 100;
        best = Math.max(best, i === 0 ? raw : raw * VARIANT_SCORE_FACTOR);
      });
    }
    return best;
  };

  const whole = score(text);
  if (whole >= 100) return null;
  const pieceThreshold = whole < LOOSE_WHOLE_MAX ? LOOSE_PIECE_SCORE : STRONG_SCORE;

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
      if (phraseScore < pieceThreshold) continue;
      if (pieceThreshold !== STRONG_SCORE && phrase.split(" ").every((word) => DESCRIPTOR_WORDS.has(word.toLowerCase()))) {
        continue;
      }
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
