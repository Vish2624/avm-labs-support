import type { Money } from "@/lib/pricing/money";
import type { ServiceType } from "@/lib/constants/service-types";
import type { AvailabilityStatus } from "@/lib/constants/availability";
import type { SearchMatchType } from "@/lib/search/matching/rank-results";

/**
 * One searchTests() result: a verified test catalog row joined to its
 * current price at the requested location + service type. Every field is a
 * real DB value — see lib/search/catalog/search-tests.ts, which only returns tests
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

/**
 * One finished search-box search, logged so admins can see what agents fail
 * to find (lib/database/search-events.ts). A pick has pickedTestId set; a
 * miss has resultCount 0 and no pick.
 */
export interface SearchEvent {
  id: string;
  query: string;
  normalizedQuery: string;
  locationId: string | null;
  resultCount: number;
  pickedTestId: string | null;
  /** 1-based position among the rule-based results; null when picked from the AI fallback list. */
  pickedRank: number | null;
  /** The zero-result search made just before this pick, if any (normalized). */
  previousMissQuery: string | null;
  createdAt: string;
}

/** A search agents made that found nothing — Admin > Missed searches, "No results". */
export interface MissedSearch {
  normalizedQuery: string;
  /** The most recent wording as typed — what becomes the alias. */
  query: string;
  count: number;
  lastSeenAt: string;
  /** The test agents most often picked right after this miss, if any. */
  suggestedTestId: string | null;
  suggestedCount: number;
}

/** A test agents picked from below the top result for a query — "Wrong top result". */
export interface MisrankedSearch {
  normalizedQuery: string;
  query: string;
  testId: string;
  /** Picks of this test from below the top result (or from the AI list). */
  count: number;
  /** Every pick made for this query, whichever test. */
  totalPicks: number;
  lastSeenAt: string;
}

export interface SearchLearningSummary {
  missed: MissedSearch[];
  misranked: MisrankedSearch[];
}
