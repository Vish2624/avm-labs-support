import type { ServiceType } from "@/lib/constants/service-types";
import type { AvailabilityStatus } from "@/lib/constants/availability";

/**
 * Mirrors `test_prices` — one row per test + location + service type.
 * `price` is an integer minor-unit amount (see lib/pricing/money.ts), never
 * a raw float. Temporal (effectiveFrom/To) so exactly one row is "current"
 * (effectiveTo null) per test+location+serviceType; `versionId` ties it back
 * to the price_list_versions import that produced it.
 */
export interface TestPrice {
  id: string;
  testId: string;
  locationId: string;
  serviceType: ServiceType;
  price: number; // minor units
  currencyCode: string; // ISO 4217
  tatText: string;
  availability: AvailabilityStatus;
  effectiveFrom: string;
  effectiveTo: string | null;
  versionId: string | null;
  createdAt: string;
  updatedAt: string;
}
