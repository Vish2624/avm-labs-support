import "server-only";
import { getCurrentProfilePrices } from "@/lib/database/profiles";
import type { ProfilePrice } from "@/types/profile";
import type { ServiceType } from "@/lib/constants/service-types";

/**
 * Look up profiles' current bundle price/TAT/availability for a location +
 * service type, keyed by profile id. A profile not carried at this
 * location/service type is simply absent from the map — never computed
 * from component test prices or backfilled (spec: fixed bundle price only).
 */
export async function getProfilePricing(
  profileIds: string[],
  locationId: string,
  serviceType: ServiceType
): Promise<Map<string, ProfilePrice>> {
  const prices = await getCurrentProfilePrices(profileIds, locationId, serviceType);
  return new Map(prices.map((price) => [price.profileId, price]));
}
