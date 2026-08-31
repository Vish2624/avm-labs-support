/** Mirrors the `tests` table — master catalog, prices live separately (see price.ts). */
export interface Test {
  id: string;
  code: string;
  officialName: string;
  category: string | null;
  description: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type AliasType = "customer_term" | "brand_name" | "abbreviation" | "misspelling" | "other";

/** Mirrors `test_aliases` — admin-curated mappings (e.g. "insulin resistance" -> Insulin PP). */
export interface TestAlias {
  id: string;
  testId: string;
  alias: string;
  aliasType: AliasType;
  createdAt: string;
}

/** Mirrors `test_components` — a test made up of other tests (e.g. a bundled panel). */
export interface TestComponent {
  id: string;
  testId: string;
  componentTestId: string;
}
