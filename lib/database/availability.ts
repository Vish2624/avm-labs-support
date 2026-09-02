import "server-only";
import { listCurrentPricesWithTestInfo, updatePriceAvailability } from "./prices";
import { listCurrentProfilePricesWithProfileInfo, updateProfilePriceAvailability } from "./profiles";
import type { ServiceType } from "@/lib/constants/service-types";
import type { AvailabilityStatus } from "@/lib/constants/availability";
import type { Money } from "@/lib/pricing/money";

export type AvailabilityKind = "test" | "profile";

/**
 * One row the Admin Availability page can toggle: a test's or a profile's
 * current price at one location + service type. Unifies test_prices and
 * profile_prices into one list/update surface since both are just
 * "something priced at a location" from this page's point of view.
 */
export interface AvailabilityRow {
  kind: AvailabilityKind;
  priceId: string;
  code: string;
  label: string;
  locationId: string;
  serviceType: ServiceType;
  price: Money;
  tatText: string;
  availability: AvailabilityStatus;
}

export async function listAvailabilityRows(filter?: {
  locationId?: string;
  serviceType?: ServiceType;
}): Promise<AvailabilityRow[]> {
  const [testPrices, profilePrices] = await Promise.all([
    listCurrentPricesWithTestInfo(filter),
    listCurrentProfilePricesWithProfileInfo(filter),
  ]);

  const testRows: AvailabilityRow[] = testPrices.map((price) => ({
    kind: "test",
    priceId: price.id,
    code: price.testCode,
    label: price.testOfficialName,
    locationId: price.locationId,
    serviceType: price.serviceType,
    price: { amount: price.price, currency: price.currencyCode },
    tatText: price.tatText,
    availability: price.availability,
  }));

  const profileRows: AvailabilityRow[] = profilePrices.map((price) => ({
    kind: "profile",
    priceId: price.id,
    code: price.profileCode,
    label: price.profileName,
    locationId: price.locationId,
    serviceType: price.serviceType,
    price: { amount: price.price, currency: price.currencyCode },
    tatText: price.tatText,
    availability: price.availability,
  }));

  return [...testRows, ...profileRows];
}

export async function updateAvailability(
  kind: AvailabilityKind,
  priceId: string,
  availability: AvailabilityStatus
): Promise<void> {
  if (kind === "test") return updatePriceAvailability(priceId, availability);
  return updateProfilePriceAvailability(priceId, availability);
}
