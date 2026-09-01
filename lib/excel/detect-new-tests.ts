import type { PriceRowInput } from "@/lib/validation/price-schema";

/**
 * Test codes among validated rows that don't exist in the master catalog
 * yet. Flagged as a warning, not blocked — the new test is created as part
 * of activation (see AVM_PLAN.md's Excel schema: "matches existing code, or
 * new -> flagged 'NEW TEST' for admin confirmation"). Pure — the caller
 * supplies the current catalog's codes.
 */
export function detectNewTests(rows: PriceRowInput[], existingTestCodes: Set<string>): Set<string> {
  const normalizedExisting = new Set([...existingTestCodes].map((code) => code.trim().toUpperCase()));
  const newCodes = new Set<string>();

  for (const row of rows) {
    if (!normalizedExisting.has(row.testCode.trim().toUpperCase())) {
      newCodes.add(row.testCode);
    }
  }

  return newCodes;
}
