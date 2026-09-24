import "server-only";
import { listActiveTests } from "@/lib/database/tests";
import { listActiveProfilesWithTests } from "@/lib/database/profiles";
import { getCurrentPricesForSearch } from "@/lib/database/prices";
import { getProfilePricing } from "@/lib/profiles/profile-pricing";
import { hydrateProfileTests } from "@/lib/profiles/hydrate-profile-tests";
import { toSearchResult } from "./search-tests";
import { aiSearch, type AiConfidence } from "./ai-search";
import type { ServiceType } from "@/lib/constants/service-types";
import type { SearchTestResult } from "@/types/search";
import type { ProfileSearchResult } from "@/types/profile";

export type AiSearchItem =
  | { kind: "test"; confidence: AiConfidence; result: SearchTestResult }
  | { kind: "package"; confidence: AiConfidence; result: ProfileSearchResult };

export interface AiSearchResponse {
  correctedQuery: string | null;
  /** Best first, in the model's order. Only items priced at this location/service type. */
  items: AiSearchItem[];
}

/**
 * The AI's picks for a query, joined to real prices exactly like the
 * rule-based search: a test is shown at the first of `testServiceTypes`
 * that prices it here, a package at `packageServiceType`, and anything not
 * priced here is dropped — never shown with placeholder data. Null when
 * the AI layer is off or failed.
 */
export async function aiSearchResults(
  query: string,
  locationId: string,
  testServiceTypes: readonly ServiceType[],
  packageServiceType: ServiceType
): Promise<AiSearchResponse | null> {
  const answer = await aiSearch(query);
  if (!answer) return null;
  if (answer.matches.length === 0) return { correctedQuery: answer.correctedQuery, items: [] };

  const testIds = answer.matches.filter((match) => match.kind === "test").map((match) => match.id);
  const profileIds = answer.matches.filter((match) => match.kind === "package").map((match) => match.id);

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

  const items: AiSearchItem[] = [];
  for (const match of answer.matches) {
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
  return { correctedQuery: answer.correctedQuery, items };
}
