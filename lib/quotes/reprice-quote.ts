import "server-only";
import { getCurrentPrices } from "@/lib/database/prices";
import { getTestsByIds } from "@/lib/database/tests";
import { listActiveProfilesWithTests } from "@/lib/database/profiles";
import { getProfilePricing } from "@/lib/profiles/profile-pricing";
import { hydrateProfileTests } from "@/lib/profiles/hydrate-profile-tests";
import { SERVICE_TYPES } from "@/lib/constants/service-types";
import type { QuoteHistoryLine } from "@/types/quote-history";
import type { QuotationLineItem } from "@/types/quotation";

export interface RepricedQuote {
  lineItems: QuotationLineItem[];
  /** Names of saved lines with no current price at this location any more — left out, never shown at the old price. */
  dropped: string[];
}

/**
 * Rebuilds a saved quote's lines from *current* catalog prices, for
 * History's "Reopen in Quote". The saved snapshot is never reused as a live
 * price: a test/package that's no longer priced at this location + service
 * type is dropped and reported, the same rule search follows.
 */
export async function repriceQuote(locationId: string, lines: QuoteHistoryLine[]): Promise<RepricedQuote> {
  const repriced = new Map<string, QuotationLineItem>();
  const lineKey = (line: { kind: string; refId: string }) => `${line.kind}:${line.refId}`;

  const testLines = lines.filter((line) => line.kind === "test");
  const packageLines = lines.filter((line) => line.kind === "package");

  if (testLines.length > 0) {
    const tests = await getTestsByIds([...new Set(testLines.map((line) => line.refId))]);
    const testById = new Map(tests.filter((test) => test.active).map((test) => [test.id, test]));
    for (const serviceType of SERVICE_TYPES) {
      const ids = testLines.filter((line) => line.serviceType === serviceType).map((line) => line.refId);
      if (ids.length === 0) continue;
      const prices = await getCurrentPrices(ids, locationId, serviceType);
      for (const price of prices) {
        const test = testById.get(price.testId);
        if (!test) continue;
        repriced.set(lineKey({ kind: "test", refId: test.id }), {
          kind: "test",
          testId: test.id,
          code: test.code,
          name: test.officialName,
          price: { amount: price.price, currency: price.currencyCode },
          tatText: price.tatText,
          serviceType: price.serviceType,
          availability: price.availability,
        });
      }
    }
  }

  if (packageLines.length > 0) {
    const profiles = await listActiveProfilesWithTests();
    const wanted = new Set(packageLines.map((line) => line.refId));
    const matching = profiles.filter(({ profile }) => wanted.has(profile.id));
    const testsByProfileId = await hydrateProfileTests(
      new Map(matching.map(({ profile, testIds }) => [profile.id, testIds]))
    );
    for (const serviceType of SERVICE_TYPES) {
      const ids = packageLines.filter((line) => line.serviceType === serviceType).map((line) => line.refId);
      if (ids.length === 0) continue;
      const pricing = await getProfilePricing(ids, locationId, serviceType);
      for (const { profile } of matching) {
        const price = pricing.get(profile.id);
        if (!price) continue;
        repriced.set(lineKey({ kind: "package", refId: profile.id }), {
          kind: "package",
          profileId: profile.id,
          code: profile.code,
          name: profile.name,
          tests: testsByProfileId.get(profile.id) ?? [],
          price: { amount: price.price, currency: price.currencyCode },
          tatText: price.tatText,
          serviceType: price.serviceType,
          availability: price.availability,
        });
      }
    }
  }

  // Keep the saved order.
  const lineItems: QuotationLineItem[] = [];
  const dropped: string[] = [];
  for (const line of lines) {
    const item = repriced.get(lineKey(line));
    if (item) lineItems.push(item);
    else dropped.push(line.name);
  }
  return { lineItems, dropped };
}
