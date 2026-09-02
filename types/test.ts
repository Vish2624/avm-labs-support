import type { AliasType } from "@/lib/constants/alias-types";

/** Mirrors the `tests` table — master catalog, prices live separately (see price.ts). */
export interface Test {
  id: string;
  code: string;
  officialName: string;
  shortName: string | null;
  category: string | null;
  description: string | null;
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

/** Mirrors `test_components` — a test made up of other tests (e.g. a bundled panel). */
export interface TestComponent {
  id: string;
  parentTestId: string;
  componentTestId: string;
  createdAt: string;
}
