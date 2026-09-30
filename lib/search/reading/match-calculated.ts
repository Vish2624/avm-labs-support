import "server-only";
import { loadSearchCatalog } from "../catalog/load-search-catalog";
import { searchCatalogCalculated } from "../catalog/search-catalog";
import { normalizeQuery } from "../matching/normalize-query";
import { FUZZY_THRESHOLD } from "../matching/build-search-candidates";
import type { ExtractTestsResult } from "./extract-tests";
import type { ServiceType } from "@/lib/constants/service-types";
import type { CalculatedSearchResult } from "@/types/search";

export type ExtractionWithCalculated = ExtractTestsResult & {
  /** Calculated parameters the message asked for (e.g. "eGFR"), each with the tests to order for it. */
  calculated: CalculatedSearchResult[];
};

/** Words that name no particular calculated parameter on their own ("ratio" fits a dozen). */
const GENERIC_WORDS = new Set(["ratio", "serum", "total", "urine", "blood", "test", "level", "profile", "percentage", "index", "direct"]);

/**
 * Whether `token` really names `calc`: its code/name/short name exactly, or
 * the token's words appear together, in order, inside the name ("transferrin"
 * in Transferrin Saturation). A loose fuzzy likeness isn't enough —
 * "urine creatinine" is a test of its own, not Urine Albumin/Creatinine Ratio.
 */
function names(token: string, calc: CalculatedSearchResult): boolean {
  if (calc.exact) return true;
  const phrase = normalizeQuery(token);
  if (!phrase || phrase.split(" ").every((word) => GENERIC_WORDS.has(word))) return false;
  return [calc.officialName, calc.shortName].some((name) => name && ` ${normalizeQuery(name)} `.includes(` ${phrase} `));
}

/**
 * A read message can name a calculated parameter — "eGFR", "Transferrin" —
 * which has no price of its own, so the readers leave it unmatched (or, when
 * named exactly, not offered). This looks those names up among the
 * calculated parameters, the same way the Quote search does, and returns
 * them with what to order for them instead of as "not available". A real
 * test that's simply not priced here stays "not available".
 */
export async function withCalculated(
  result: ExtractTestsResult,
  locationId: string,
  serviceTypes: readonly ServiceType[]
): Promise<ExtractionWithCalculated> {
  if (result.unmatched.length === 0 && result.notOffered.length === 0) return { ...result, calculated: [] };

  // What to order is priced in the first service type asked for (in-house before outsourced).
  const catalog = await loadSearchCatalog(locationId, serviceTypes[0]);
  const calculatedCodes = new Set(catalog.calculated.map((calc) => calc.code.toUpperCase()));
  const tokens = [
    ...result.unmatched,
    // Only a "not offered" that IS a calculated parameter (named exactly, so it has no price).
    ...result.notOffered.filter((test) => calculatedCodes.has(test.code.toUpperCase())).map((test) => test.token),
  ];

  const calculated: CalculatedSearchResult[] = [];
  const resolved = new Set<string>();
  for (const token of tokens) {
    const [best] = searchCatalogCalculated(token, catalog, { minScore: FUZZY_THRESHOLD * 100 });
    if (!best || !names(token, best)) continue;
    resolved.add(token);
    if (!calculated.some((c) => c.testId === best.testId)) calculated.push(best);
  }
  // A "not offered" that pointed at a calculated parameter the name doesn't
  // really name ("urine creatinine" -> UACR) is reported as typed instead.
  const misnamed = result.notOffered.filter(
    (test) => calculatedCodes.has(test.code.toUpperCase()) && !resolved.has(test.token)
  );
  return {
    ...result,
    unmatched: [...result.unmatched.filter((token) => !resolved.has(token)), ...misnamed.map((test) => test.token)],
    notOffered: result.notOffered.filter((test) => !resolved.has(test.token) && !misnamed.includes(test)),
    calculated,
  };
}
