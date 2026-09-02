/**
 * Central constant/type for a test alias's kind, mirroring the pattern in
 * service-types.ts/availability.ts.
 */
export const ALIAS_TYPES = ["customer_term", "brand_name", "abbreviation", "misspelling", "other"] as const;

export type AliasType = (typeof ALIAS_TYPES)[number];

export const ALIAS_TYPE_LABELS: Record<AliasType, string> = {
  customer_term: "Customer term",
  brand_name: "Brand name",
  abbreviation: "Abbreviation",
  misspelling: "Misspelling",
  other: "Other",
};

export function isAliasType(value: string): value is AliasType {
  return (ALIAS_TYPES as readonly string[]).includes(value);
}
