import "server-only";
import { listActiveProfilesWithTests } from "@/lib/database/profiles";
import { loadWebsiteSuggestionData } from "@/lib/database/website-catalog";
import { getProfilePricing } from "./profile-pricing";
import { hydrateProfileTests } from "./hydrate-profile-tests";
import { websiteSuggestions } from "./website-suggestions";
import type { ProfileSuggestion } from "@/types/profile";

/**
 * The Quote's profile suggestions, by the website's rules (see
 * website-suggestions.ts), best first, in the ProfileSuggestion shape the
 * Quote already shows — each with what it replaces and what switching costs.
 * Profiles are In-House on the website's side, so they're priced In-House.
 */
export async function findWebsiteSuggestions(
  quoteTestIds: string[],
  quoteProfileIds: string[],
  locationId: string
): Promise<ProfileSuggestion[]> {
  const data = await loadWebsiteSuggestionData(locationId);
  if (!data.rules) return [];
  const ranked = websiteSuggestions({ quoteTestIds, quoteProfileIds, ...data, rules: data.rules });
  if (ranked.length === 0) return [];

  const ids = ranked.map((s) => s.profileId);
  const [profiles, pricing, rosters] = await Promise.all([
    listActiveProfilesWithTests(),
    getProfilePricing(ids, locationId, "in_house"),
    hydrateProfileTests(new Map(data.profiles.filter((p) => ids.includes(p.id)).map((p) => [p.id, p.testIds]))),
  ]);
  const profileById = new Map(profiles.map(({ profile }) => [profile.id, profile]));
  const profileTestIds = new Map(data.profiles.map((p) => [p.id, p.testIds]));

  return ranked.flatMap((s) => {
    const profile = profileById.get(s.profileId);
    const price = pricing.get(s.profileId);
    if (!profile || !price) return [];
    const testIds = profileTestIds.get(s.profileId) ?? [];
    const matched = testIds.filter((id) => !s.extraTestIds.includes(id));
    const money = (amount: number) => ({ amount, currency: price.currencyCode });
    return [
      {
        profileId: profile.id,
        code: profile.code,
        name: profile.name,
        description: profile.description,
        tests: rosters.get(profile.id) ?? [],
        matchedTestIds: matched,
        matchedCount: matched.length,
        requestedCount: quoteTestIds.length,
        profileTestCount: testIds.length,
        // How much of the quote it takes over, as the website shows it: each test, or profile it wholly contains, counts once.
        matchPercentage: Math.round(
          ((s.replacesTestIds.length + s.replacesProfileIds.length) / (quoteTestIds.length + quoteProfileIds.length)) * 100
        ),
        price: money(price.price),
        tatText: price.tatText,
        availability: price.availability,
        serviceType: price.serviceType,
        website: {
          replacesTestIds: s.replacesTestIds,
          replacesProfileIds: s.replacesProfileIds,
          extraTestIds: s.extraTestIds,
          extra: money(s.extra),
          worth: money(s.worth),
          freeHomeCollection: s.freeHomeCollection,
          recommended: s.recommended,
          pick: s.pick,
        },
      },
    ];
  });
}
