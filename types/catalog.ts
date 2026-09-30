import type { ServiceType } from "@/lib/constants/service-types";
import type { AvailabilityStatus } from "@/lib/constants/availability";
import type { Test, TestAlias, TestType } from "./test";

/** The Admin catalog sections — every Test Master type an admin edits directly (parameters live inside components). */
export type CatalogType = Exclude<TestType, "parameter">;

/** One current price cell: a test at one location + service type. `price` is in minor units. */
export interface CatalogPrice {
  locationId: string;
  serviceType: ServiceType;
  price: number;
  currencyCode: string;
  tatText: string;
  availability: AvailabilityStatus;
}

/** A row in an Admin catalog list (Tests / Components / Calculated). */
export interface CatalogListItem {
  id: string;
  code: string;
  officialName: string;
  shortName: string | null;
  description: string | null;
  testType: TestType;
  active: boolean;
  /** Current prices (tests and components only). */
  prices: CatalogPrice[];
  /** Components: how many parameters. */
  parameterCount: number;
  /** Calculated parameters: the direct sources' names. */
  sourceNames: string[];
}

export interface CatalogRef {
  id: string;
  code: string;
  name: string;
  testType?: TestType;
}

/** Everything the Admin editor shows for one item. */
export interface CatalogItemDetail {
  test: Test;
  aliases: TestAlias[];
  prices: CatalogPrice[];
  /** Components: their parameters, in order. */
  parameters: { id: string; code: string; officialName: string; shortName: string | null }[];
  /** Calculated parameters: their direct source tests. */
  sources: CatalogRef[];
  /** Where this item is used — profiles containing it, calculated parameters derived from it. */
  usedIn: { profiles: CatalogRef[]; calculated: CatalogRef[] };
}

/** A profile's reference figures at one location + service type, from its measured tests' current prices. */
export interface ProfileReference {
  locationId: string;
  serviceType: ServiceType;
  /** Sum of the measured tests' prices (minor units) — a guide only, never the profile's price. */
  sum: number;
  currencyCode: string;
  /** The slowest measured test's TAT — the profile's TAT. */
  slowestTat: string | null;
  /** Measured tests (or, for a package, parts) with no price here — the sum and TAT leave them out. */
  unpriced: string[];
  /** Packages: what the sum is made of, e.g. ["Liver Profile", "Kidney Function Test", "2 tests"]. */
  parts?: string[];
}
