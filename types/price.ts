import type { ServiceType } from "@/lib/constants/service-types";
import type { AvailabilityStatus } from "@/lib/constants/availability";

/**
 * Mirrors `test_prices` — one row per test + location + service type.
 * `price` is an integer minor-unit amount (see lib/pricing/money.ts), never
 * a raw float. Temporal (effectiveFrom/To) so a price can be looked up
 * as-of any date; `versionId` ties it back to the import that produced it.
 */
export interface TestPrice {
  id: string;
  testId: string;
  locationId: string;
  serviceType: ServiceType;
  price: number; // minor units
  currency: string; // ISO 4217
  tatText: string;
  availability: AvailabilityStatus;
  effectiveFrom: string;
  effectiveTo: string | null;
  versionId: string;
  createdAt: string;
  updatedAt: string;
}
