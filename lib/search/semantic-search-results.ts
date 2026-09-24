import "server-only";
import { listActiveTests } from "@/lib/database/tests";
import { listActiveProfilesWithTests } from "@/lib/database/profiles";
import { getCurrentPricesForSearch } from "@/lib/database/prices";
import { getProfilePricing } from "@/lib/profiles/profile-pricing";
import { hydrateProfileTests } from "@/lib/profiles/hydrate-profile-tests";
import { toSearchResult } from "./search-tests";
import type { ServiceType } from "@/lib/constants/service-types";
import type { SearchTestResult } from "@/types/search";
import type { ProfileSearchResult } from "@/types/profile";

export type SemanticConfidence = "high" | "low";

/** One catalog item the in-browser model picked for a query (see lib/search/semantic-worker.ts). */
export interface SemanticMatch {
  kind: "test" | "package";
  id: string;
  confidence: SemanticConfidence;
}

export type SemanticSearchItem =
  | { kind: "test"; confidence: SemanticConfidence; result: SearchTestResult }
  | { kind: "package"; confidence: SemanticConfidence; result: ProfileSearchResult };

/**
 * The in-browser model's picks, joined to real prices exactly like the
 * rule-based search: a test is shown at the first of `testServiceTypes`
 * that prices it here, a package at `packageServiceType`, and anything not
 * priced here — or not an active catalog item at all — is dropped, never
 * shown with placeholder data. Keeps the model's order.
 */
export async function priceSemanticMatches(
  matches: SemanticMatch[],
  locationId: string,
  testServiceTypes: readonly ServiceType[],
  packageServiceType: ServiceType
): Promise<SemanticSearchItem[]> {
  if (matches.length === 0) return [];

  const testIds = matches.filter((match) => match.kind === "test").map((match) => match.id);
  const profileIds = matches.filter((match) => match.kind === "package").map((match) => match.id);

  const [tests, profiles, pricesByType, profilePricing] = await Promise.all([
    listActiveTests(),
    listActiveProfilesWithTests(),
    Promise.all(testServiceTypes.map((type) => getCurrentPricesForSearch(testIds, locationId, type))),
    getProfilePricing(profileIds, locationId, packageServiceType),
  ]);
  const testById = new Map(tests.map((test) => [test.id, test]));
  const profileById = new Map(profiles.map((entry) => [entry.profile.id, entry]));
  const rosters = await hydrateProfileTests(
    new Map(profileIds.map((id) => [id, profileById.get(id)?.testIds ?? []]))
  );

  const items: SemanticSearchItem[] = [];
  for (const match of matches) {
    if (match.kind === "test") {
      const test = testById.get(match.id);
      const price = pricesByType.flat().find((row) => row.testId === match.id);
      if (!test || !price) continue;
      items.push({
        kind: "test",
        confidence: match.confidence,
        result: toSearchResult(test, { testId: test.id, matchType: "ai", score: 0 }, price),
      });
    } else {
      const entry = profileById.get(match.id);
      const price = profilePricing.get(match.id);
      if (!entry || !price) continue;
      items.push({
        kind: "package",
        confidence: match.confidence,
        result: {
          profileId: entry.profile.id,
          code: entry.profile.code,
          name: entry.profile.name,
          description: entry.profile.description,
          tests: rosters.get(entry.profile.id) ?? [],
          price: { amount: price.price, currency: price.currencyCode },
          tatText: price.tatText,
          availability: price.availability,
          serviceType: price.serviceType,
          includedTest: null,
          nameScore: null,
        },
      });
    }
  }
  return items;
}
