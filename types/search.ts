import type { Money } from "@/lib/pricing/money";
import type { ServiceType } from "@/lib/constants/service-types";
import type { AvailabilityStatus } from "@/lib/constants/availability";
import type { SearchMatchType } from "@/lib/search/rank-results";

/**
 * One searchTests() result: a verified test catalog row joined to its
 * current price at the requested location + service type. Every field is a
 * real DB value — see lib/search/search-tests.ts, which only returns tests
 * that have a current price row (never backfills or invents one).
 */
export interface SearchTestResult {
  testId: string;
  code: string;
  officialName: string;
  shortName: string | null;
  category: string | null;
  matchType: SearchMatchType;
  /** The alias text that matched, when matchType is "alias"; otherwise null. */
  matchedAlias: string | null;
  price: Money;
  tatText: string;
  availability: AvailabilityStatus;
  serviceType: ServiceType;
}
