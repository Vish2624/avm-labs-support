import "server-only";
import { listActiveTests } from "@/lib/database/tests";
import { listActiveProfilesWithTests, getCurrentProfilePrices } from "@/lib/database/profiles";
import { getCurrentPricesForSearch } from "@/lib/database/prices";
import { hydrateProfileTests } from "@/lib/profiles/hydrate-profile-tests";
import { dedupeProfilesByName } from "@/lib/profiles/dedupe-profiles";
import { fastingForPackage, fastingForTest } from "./fasting-guide";
import type { ServiceType } from "@/lib/constants/service-types";
import type { AiRelevanceLevel, AiSuggestion } from "@/types/ai-assistant";

/** A catalog test or package with its current price at the agent's location — everything but the AI's reason. */
export type PricedItem =
  | Omit<Extract<AiSuggestion, { kind: "test" }>, "relevanceScore" | "relevanceLevel" | "reason" | "fasting">
  | Omit<Extract<AiSuggestion, { kind: "package" }>, "relevanceScore" | "relevanceLevel" | "reason" | "fasting">;

export interface PricedCatalog {
  /** Every sellable item at this location, keyed by upper-cased code. Tests win over a package sharing their code. */
  byCode: Map<string, PricedItem>;
  items: PricedItem[];
}

const codeKey = (code: string) => code.trim().toUpperCase();

/**
 * The tests and packages the agent can actually quote at this location,
 * each joined to its current price/TAT/availability. `serviceTypes` is
 * tried in order ("All" = in-house first, then outsourced). This is the
 * only list the assistant is allowed to recommend from — the AI hands back
 * codes, and anything not in here is dropped.
 */
export async function loadPricedCatalog(
  locationId: string,
  serviceTypes: readonly ServiceType[]
): Promise<PricedCatalog> {
  const [tests, profiles] = await Promise.all([listActiveTests(), listActiveProfilesWithTests()]);
  const testIds = tests.map((test) => test.id);
  const profileIds = profiles.map(({ profile }) => profile.id);

  const [testPrices, profilePrices] = await Promise.all([
    Promise.all(serviceTypes.map((type) => getCurrentPricesForSearch(testIds, locationId, type))),
    Promise.all(serviceTypes.map((type) => getCurrentProfilePrices(profileIds, locationId, type))),
  ]);

  const byCode = new Map<string, PricedItem>();

  const testById = new Map(tests.map((test) => [test.id, test]));
  for (const prices of testPrices) {
    for (const price of prices) {
      const test = testById.get(price.testId);
      if (!test || byCode.has(codeKey(test.code))) continue;
      byCode.set(codeKey(test.code), {
        kind: "test",
        testId: test.id,
        code: test.code,
        name: test.officialName,
        price: { amount: price.price, currency: price.currencyCode },
        tatText: price.tatText,
        availability: price.availability,
        serviceType: price.serviceType,
      });
    }
  }

  const profileById = new Map(profiles.map((entry) => [entry.profile.id, entry]));
  const pricedProfiles: { profileId: string; code: string; name: string; price: (typeof profilePrices)[number][number] }[] = [];
  const seenProfiles = new Set<string>();
  for (const prices of profilePrices) {
    for (const price of prices) {
      const entry = profileById.get(price.profileId);
      if (!entry || seenProfiles.has(entry.profile.id)) continue;
      seenProfiles.add(entry.profile.id);
      pricedProfiles.push({ profileId: entry.profile.id, code: entry.profile.code, name: entry.profile.name, price });
    }
  }
  const keptProfiles = dedupeProfilesByName(pricedProfiles);
  const rosters = await hydrateProfileTests(
    new Map(keptProfiles.map(({ profileId }) => [profileId, profileById.get(profileId)?.testIds ?? []]))
  );
  for (const { profileId, code, name, price } of keptProfiles) {
    if (byCode.has(codeKey(code))) continue;
    byCode.set(codeKey(code), {
      kind: "package",
      profileId,
      code,
      name,
      tests: rosters.get(profileId) ?? [],
      price: { amount: price.price, currency: price.currencyCode },
      tatText: price.tatText,
      availability: price.availability,
      serviceType: price.serviceType,
    });
  }

  return { byCode, items: [...byCode.values()] };
}

export function findPriced(catalog: PricedCatalog, code: string): PricedItem | undefined {
  return catalog.byCode.get(codeKey(code));
}

export function toSuggestion(
  item: PricedItem,
  relevance: { score: number; level: AiRelevanceLevel; reason: string }
): AiSuggestion {
  const fasting =
    item.kind === "test"
      ? fastingForTest(item.code)
      : fastingForPackage(
          item.code,
          item.tests.map((test) => test.code)
        );
  return { ...item, relevanceScore: relevance.score, relevanceLevel: relevance.level, reason: relevance.reason, fasting };
}

/** Stable identity across tests and packages, for de-duplication. */
export function suggestionKey(item: PricedItem): string {
  return item.kind === "test" ? `test:${item.testId}` : `package:${item.profileId}`;
}
