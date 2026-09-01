import "server-only";
import { listActiveProfilesWithTests } from "@/lib/database/profiles";
import { getProfilePricing } from "./profile-pricing";
import { hydrateProfileTests } from "./hydrate-profile-tests";
import { calculateProfileMatch, rankProfileMatches } from "./calculate-profile-match";
import type { ServiceType } from "@/lib/constants/service-types";
import type { ProfileSuggestion } from "@/types/profile";

/**
 * Query profiles containing any of the given test ids, ranked by match
 * (see calculate-profile-match.ts), joined to real current pricing for the
 * requested location + service type. Used by the Support Workspace's
 * profile-suggestions panel (rank from the currently selected tests) and
 * by /profiles' "search by test names" mode (rank from resolved test ids).
 */
export async function findMatchingProfiles(
  testIds: string[],
  locationId: string,
  serviceType: ServiceType
): Promise<ProfileSuggestion[]> {
  if (testIds.length === 0) return [];

  const profiles = await listActiveProfilesWithTests();

  const matches = rankProfileMatches(
    profiles.map(({ profile, testIds: profileTestIds }) =>
      calculateProfileMatch(testIds, { profileId: profile.id, profileTestIds })
    )
  ).filter((match) => match.matchedCount > 0);

  if (matches.length === 0) return [];

  const profileById = new Map(profiles.map(({ profile }) => [profile.id, profile]));
  const profileTestIdsById = new Map(profiles.map(({ profile, testIds: ids }) => [profile.id, ids]));
  const [pricingByProfileId, testsByProfileId] = await Promise.all([
    getProfilePricing(
      matches.map((match) => match.profileId),
      locationId,
      serviceType
    ),
    hydrateProfileTests(
      new Map(matches.map((match) => [match.profileId, profileTestIdsById.get(match.profileId) ?? []]))
    ),
  ]);

  const suggestions: ProfileSuggestion[] = [];
  for (const match of matches) {
    const profile = profileById.get(match.profileId);
    const price = pricingByProfileId.get(match.profileId);
    // A matched profile with no current price at this location/service
    // type isn't shown — never backfilled with placeholder data.
    if (!profile || !price) continue;

    suggestions.push({
      profileId: profile.id,
      code: profile.code,
      name: profile.name,
      description: profile.description,
      tests: testsByProfileId.get(profile.id) ?? [],
      matchedTestIds: match.matchedTestIds,
      matchedCount: match.matchedCount,
      requestedCount: match.requestedCount,
      profileTestCount: match.profileTestCount,
      matchPercentage: match.matchPercentage,
      price: { amount: price.price, currency: price.currencyCode },
      tatText: price.tatText,
      availability: price.availability,
      serviceType: price.serviceType,
    });
  }

  return suggestions;
}
