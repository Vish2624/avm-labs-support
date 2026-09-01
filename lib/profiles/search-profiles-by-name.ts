import "server-only";
import { listActiveProfilesWithTests } from "@/lib/database/profiles";
import { getProfilePricing } from "./profile-pricing";
import { hydrateProfileTests } from "./hydrate-profile-tests";
import { normalizeQuery } from "@/lib/search/normalize-query";
import { fuzzyMatch } from "@/lib/search/fuzzy-match";
import { FUZZY_THRESHOLD } from "@/lib/search/build-search-candidates";
import type { Profile } from "@/types/profile";
import type { ServiceType } from "@/lib/constants/service-types";
import type { ProfileSearchResult } from "@/types/profile";

/** Cap on how many ranked candidates get priced/returned per search. */
const MAX_RESULTS = 20;

/**
 * Search profiles by name or code — exact match first, then fuzzy (the same
 * Jaccard trigram scoring searchTests() uses for the test catalog). Powers
 * /profiles' "search by name" mode; ranking by test overlap instead is
 * findMatchingProfiles().
 */
export async function searchProfilesByName(
  query: string,
  locationId: string,
  serviceType: ServiceType
): Promise<ProfileSearchResult[]> {
  const normalized = normalizeQuery(query);
  if (!normalized) return [];

  const profiles = await listActiveProfilesWithTests();

  const scored: { profile: Profile; testIds: string[]; score: number }[] = [];
  for (const { profile, testIds } of profiles) {
    const codeNorm = normalizeQuery(profile.code);
    const nameNorm = normalizeQuery(profile.name);
    const score =
      normalized === codeNorm || normalized === nameNorm
        ? 100
        : Math.max(fuzzyMatch(normalized, codeNorm), fuzzyMatch(normalized, nameNorm)) * 100;
    if (score >= FUZZY_THRESHOLD * 100) scored.push({ profile, testIds, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const ranked = scored.slice(0, MAX_RESULTS);

  if (ranked.length === 0) return [];

  const [pricingByProfileId, testsByProfileId] = await Promise.all([
    getProfilePricing(
      ranked.map((entry) => entry.profile.id),
      locationId,
      serviceType
    ),
    hydrateProfileTests(new Map(ranked.map((entry) => [entry.profile.id, entry.testIds]))),
  ]);

  const results: ProfileSearchResult[] = [];
  for (const { profile } of ranked) {
    const price = pricingByProfileId.get(profile.id);
    // A matched profile with no current price at this location/service
    // type isn't shown — never backfilled with placeholder data.
    if (!price) continue;

    results.push({
      profileId: profile.id,
      code: profile.code,
      name: profile.name,
      description: profile.description,
      tests: testsByProfileId.get(profile.id) ?? [],
      price: { amount: price.price, currency: price.currencyCode },
      tatText: price.tatText,
      availability: price.availability,
      serviceType: price.serviceType,
    });
  }

  return results;
}
