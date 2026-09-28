import "server-only";
import { listActiveTests } from "@/lib/database/tests";
import { getCurrentPricesForSearch } from "@/lib/database/prices";
import { listActiveProfilesWithTests } from "@/lib/database/profiles";
import { getProfilePricing } from "@/lib/profiles/profile-pricing";
import { hydrateProfileTests } from "@/lib/profiles/hydrate-profile-tests";
import { dedupeProfilesByName } from "@/lib/profiles/dedupe-profiles";
import { toSearchResult } from "./search-tests";
import type { ServiceType } from "@/lib/constants/service-types";
import type { SearchTestResult } from "@/types/search";
import type { ProfileSearchResult } from "@/types/profile";

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });

/**
 * Every active test with a current price at this location + service type,
 * A–Z by name — the Workspace's full list when a service type is picked
 * with an empty search box. Unpriced tests are left out, same as search.
 */
export async function browseTests(locationId: string, serviceType: ServiceType): Promise<SearchTestResult[]> {
  const tests = await listActiveTests();
  const prices = await getCurrentPricesForSearch(
    tests.map((test) => test.id),
    locationId,
    serviceType
  );
  const priceByTestId = new Map(prices.map((price) => [price.testId, price]));

  return tests
    .flatMap((test) => {
      const price = priceByTestId.get(test.id);
      return price ? [toSearchResult(test, { testId: test.id, matchType: "fuzzy", score: 0 }, price)] : [];
    })
    .sort((a, b) => byName(a.officialName, b.officialName));
}

/** Every active package priced at this location + service type, A–Z by name. */
export async function browseProfiles(locationId: string, serviceType: ServiceType): Promise<ProfileSearchResult[]> {
  const profiles = await listActiveProfilesWithTests();
  const pricingByProfileId = await getProfilePricing(
    profiles.map(({ profile }) => profile.id),
    locationId,
    serviceType
  );
  const priced = profiles.filter(({ profile }) => pricingByProfileId.has(profile.id));
  const testsByProfileId = await hydrateProfileTests(new Map(priced.map(({ profile, testIds }) => [profile.id, testIds])));

  const results = priced
    .map(({ profile }): ProfileSearchResult => {
      const price = pricingByProfileId.get(profile.id)!;
      return {
        profileId: profile.id,
        code: profile.code,
        name: profile.name,
        description: profile.description,
        tests: testsByProfileId.get(profile.id) ?? [],
        price: { amount: price.price, currency: price.currencyCode },
        tatText: price.tatText,
        availability: price.availability,
        serviceType: price.serviceType,
        includedTest: null,
        nameScore: null,
      };
    })
    .sort((a, b) => byName(a.name, b.name));
  return dedupeProfilesByName(results);
}
