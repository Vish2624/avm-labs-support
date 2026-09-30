import type { AliasType } from "@/lib/constants/alias-types";

/**
 * What a Test Master row is:
 * - test: an individual test, measured directly, orderable (e.g. TSH)
 * - component: an orderable test reported as a group of parameters (e.g. H6 / CBC)
 * - parameter: a child of a component (e.g. Hemoglobin) — never priced; finds its component
 * - calculated: derived from other tests (e.g. Serum Globulin) — never priced; suggests its sources
 *
 * Stored in `tests.category` as one of the reserved values below; any other
 * category (or none) is an individual test. Links live in `test_components`
 * (component -> parameter, calculated -> source).
 */
export type TestType = "test" | "component" | "parameter" | "calculated";

export const TEST_TYPE_CATEGORIES: Record<Exclude<TestType, "test">, string> = {
  component: "Component",
  parameter: "Parameter",
  calculated: "Calculated Parameter",
};

/**
 * A calculated parameter can be orderable only as part of a whole profile
 * (eGFR comes with the Kidney Function Test, never on its own). Kept in the
 * same category value: "Calculated Parameter · via KFT" (the profile's code).
 */
const VIA_PROFILE = /\s*·\s*via\s+(\S+)\s*$/i;

export function testTypeFromCategory(category: string | null): TestType {
  const value = category?.replace(VIA_PROFILE, "").trim().toLowerCase();
  for (const [type, label] of Object.entries(TEST_TYPE_CATEGORIES)) {
    if (value === label.toLowerCase()) return type as TestType;
  }
  return "test";
}

/** The profile code a calculated parameter is ordered through, or null when its own source tests are added. */
export function viaProfileFromCategory(category: string | null): string | null {
  return testTypeFromCategory(category) === "calculated" ? (category?.match(VIA_PROFILE)?.[1] ?? null) : null;
}

/** The category value for a calculated parameter, ordered through `viaProfileCode` or not. */
export function calculatedCategory(viaProfileCode: string | null): string {
  return viaProfileCode ? `${TEST_TYPE_CATEGORIES.calculated} · via ${viaProfileCode}` : TEST_TYPE_CATEGORIES.calculated;
}

/** Mirrors the `tests` table — master catalog, prices live separately (see price.ts). */
export interface Test {
  id: string;
  code: string;
  officialName: string;
  shortName: string | null;
  category: string | null;
  description: string | null;
  testType: TestType;
  /** For a parameter: the components it belongs to. Empty otherwise. */
  componentIds: string[];
  /** For a calculated parameter: the tests it's derived from (a source may itself be calculated). Empty otherwise. */
  sourceTestIds: string[];
  /** For a calculated parameter only orderable within a profile: that profile's code (e.g. KFT for eGFR). */
  viaProfileCode: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type { AliasType };

/**
 * Mirrors `test_aliases` — admin-curated mappings (e.g. "insulin resistance"
 * -> Insulin PP). Only an alias explicitly configured here may be surfaced
 * as a match; nothing is inferred or guessed at query time.
 */
export interface TestAlias {
  id: string;
  testId: string;
  alias: string;
  normalizedAlias: string; // lowercased/trimmed form used for matching
  aliasType: AliasType;
  /** 0-100. Set by whoever configured the alias; used to break ties in ranking, not to invent matches. */
  confidence: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Mirrors `test_components` — a parent -> child link: a component to one of
 * its parameters, or a calculated parameter to one of its source tests.
 */
export interface TestComponent {
  id: string;
  parentTestId: string;
  componentTestId: string;
  createdAt: string;
}
