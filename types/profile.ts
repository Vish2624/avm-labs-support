import type { ServiceType } from "@/lib/constants/service-types";
import type { AvailabilityStatus } from "@/lib/constants/availability";
import type { Money } from "@/lib/pricing/money";

/** Mirrors `profiles`. */
export interface Profile {
  id: string;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Mirrors `profile_tests` — which tests belong to a profile. */
export interface ProfileTest {
  id: string;
  profileId: string;
  testId: string;
  required: boolean;
}

/**
 * A profile's bundle price is fixed per location + service type (not
 * computed from its component tests' prices). Temporal, same as TestPrice.
 */
export interface ProfilePrice {
  id: string;
  profileId: string;
  locationId: string;
  serviceType: ServiceType;
  price: number; // minor units, see lib/pricing/money.ts
  currencyCode: string;
  tatText: string;
  availability: AvailabilityStatus;
  effectiveFrom: string;
  effectiveTo: string | null;
  versionId: string | null;
}

/**
 * One findMatchingProfiles() result: a profile ranked by how many of the
 * requested tests it covers (see lib/profiles/calculate-profile-match.ts),
 * joined to its current bundle price at the requested location + service
 * type. Only profiles with a current price row there are ever returned.
 */
export interface ProfileSuggestion {
  profileId: string;
  code: string;
  name: string;
  description: string | null;
  matchedTestIds: string[];
  matchedCount: number;
  requestedCount: number;
  profileTestCount: number;
  /** matchedCount / requestedCount, 0-100. */
  matchPercentage: number;
  price: Money;
  tatText: string;
  availability: AvailabilityStatus;
  serviceType: ServiceType;
}
