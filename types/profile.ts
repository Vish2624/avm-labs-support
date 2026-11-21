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

/** A profile's component test, for display (e.g. the "included tests" rundown on a result card). */
export interface ProfileTestSummary {
  testId: string;
  code: string;
  officialName: string;
}

/**
 * One findMatchingProfiles() result: a profile ranked by how many of the
 * requested tests it covers (see lib/profiles/calculate-profile-match.ts),
 * joined to its current bundle price at the requested location + service
 * type. Only profiles with a current price row there are ever returned.
 * Powers the Support Workspace's profile-suggestions panel and /profiles'
 * "search by test names" mode.
 */
export interface ProfileSuggestion {
  profileId: string;
  code: string;
  name: string;
  description: string | null;
  /** All of the profile's component tests (not just the matched ones) — see ProfileTestList. */
  tests: ProfileTestSummary[];
  matchedTestIds: string[];
  matchedCount: number;
  requestedCount: number;
  profileTestCount: number;
  /** matchedCount / requestedCount, 0-100. On the Quote's suggestions: the share of quote items it takes over, as on the website. */
  matchPercentage: number;
  price: Money;
  tatText: string;
  availability: AvailabilityStatus;
  serviceType: ServiceType;
  /**
   * Set on the Quote's suggestions, which follow the website's rules
   * (lib/profiles/website-suggestions.ts): what the profile replaces on the
   * quote and what switching costs. extra.amount is negative when it saves.
   * pick: false when it only contains quoted tests without being a better deal.
   */
  website?: {
    replacesTestIds: string[];
    replacesProfileIds: string[];
    extraTestIds: string[];
    extra: Money;
    worth: Money;
    freeHomeCollection: boolean;
    recommended: boolean;
    pick: boolean;
  };
}

/**
 * One searchProfilesByName() result: a profile matched by name/code (not
 * ranked by test overlap — see ProfileSuggestion for that shape), joined to
 * its current bundle price and full test roster. Powers /profiles' "search
 * by name" mode.
 */
export interface ProfileSearchResult {
  profileId: string;
  code: string;
  name: string;
  description: string | null;
  tests: ProfileTestSummary[];
  price: Money;
  tatText: string;
  availability: AvailabilityStatus;
  serviceType: ServiceType;
  /** Set when the package matched because it contains the searched test/parameter, not by its name. */
  includedTest: ProfileTestSummary | null;
  /** Set when the package matched because it includes the searched group of tests (Pancreatic Profile). */
  includedGroup?: string | null;
  /** 0-100 strength of the package's own name/code match; null when it matched by containing the test. */
  nameScore: number | null;
}
