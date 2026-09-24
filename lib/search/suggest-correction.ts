import "server-only";
import { listActiveTests } from "@/lib/database/tests";
import { listActiveProfilesWithTests } from "@/lib/database/profiles";
import { normalizeQuery } from "./normalize-query";
import { matchScore } from "./fuzzy-match";
import { FUZZY_THRESHOLD } from "./build-search-candidates";
import { queryVariants } from "./query-variants";

/** Loosest match still worth offering as "Did you mean …?" (0-1). */
const SUGGEST_MIN_SCORE = 0.3;

/**
 * For a search that found nothing: the closest real test or package name
 * in the catalog, offered as "Did you mean …?" rather than silently
 * substituted — the match was too uncertain to show as a result. Null when
 * nothing is even loosely close. Read-only; names come straight from the DB.
 */
export async function suggestCorrection(query: string): Promise<string | null> {
  const variants = queryVariants(query, { forPackages: true });
  if (variants.length === 0) return null;

  const [tests, profiles] = await Promise.all([listActiveTests(), listActiveProfilesWithTests()]);
  const names = [
    ...tests.map((test) => test.officialName),
    ...profiles.map(({ profile }) => profile.name),
  ];

  let best: { name: string; score: number } | null = null;
  for (const name of names) {
    const normalizedName = normalizeQuery(name);
    const score = Math.max(...variants.map((variant) => matchScore(variant, normalizedName)));
    if (!best || score > best.score) best = { name, score };
  }
  // At or above FUZZY_THRESHOLD it would already have been a result (unless
  // not priced here), so only the uncertain band below it is suggested.
  return best && best.score >= SUGGEST_MIN_SCORE && best.score < FUZZY_THRESHOLD ? best.name : null;
}
