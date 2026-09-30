import type { Money } from "@/lib/pricing/money";
import type { ServiceType } from "@/lib/constants/service-types";
import type { AvailabilityStatus } from "@/lib/constants/availability";
import type { SearchMatchType } from "@/lib/search/matching/rank-results";
import type { ProfileSearchResult } from "./profile";

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
  /** This is a component found through one of its parameters (e.g. "Hemoglobin" -> H6); that parameter's name. */
  includedParameter?: string | null;
  price: Money;
  tatText: string;
  availability: AvailabilityStatus;
  serviceType: ServiceType;
}

/**
 * A calculated parameter matching a search (e.g. "Serum Globulin"). It has
 * no price of its own — the agent adds `sources`, the tests it's derived
 * from, priced at the selected location. See searchCatalogCalculated().
 */
export interface CalculatedSearchResult {
  testId: string;
  code: string;
  officialName: string;
  shortName: string | null;
  /** Extra note from the master, e.g. a source test that isn't in the price list. */
  description: string | null;
  /** The direct sources' names, as the master lists them ("Serum Albumin + Serum Globulin"). */
  sourceNames: string[];
  /** The orderable tests to add, priced here. */
  sources: SearchTestResult[];
  /** Orderable sources with no price here, by name. */
  unpricedSources: string[];
  /** Its own name/code matched the query exactly. */
  exact: boolean;
  /** Only orderable within a profile (e.g. eGFR -> KFT): that profile's code; null = add `sources`. */
  viaProfileCode: string | null;
  /** That profile, priced here — null when it isn't offered at this location. */
  viaProfile: ProfileSearchResult | null;
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
