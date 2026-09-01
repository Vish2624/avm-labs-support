import { getCurrencyFractionDigits } from "@/lib/pricing/money";
import type { PriceRowInput } from "@/lib/validation/price-schema";
import type { ParsedPriceRow } from "@/types/import";

/**
 * Maps one validated row into its staging-ready shape: price converted from
 * the sheet's decimal major-unit amount (e.g. 125.50) into the location
 * currency's integer minor unit (see lib/pricing/money.ts — this is an
 * assumption flagged alongside the rest of the proposed Excel schema, since
 * the schema doesn't say which unit Price is in), and Yes/No availability
 * mapped to the catalog's AvailabilityStatus. "Temporarily unavailable"
 * isn't reachable via import — only via the Admin UI (Phase 7) — since the
 * sheet only has a binary Available column.
 */
export function transformExcel(
  row: PriceRowInput,
  rowNumber: number,
  currencyCode: string,
  isNewTest: boolean
): ParsedPriceRow {
  const fractionDigits = getCurrencyFractionDigits(currencyCode);
  const minorUnitPrice = Math.round(row.price * 10 ** fractionDigits);

  return {
    rowNumber,
    testCode: row.testCode,
    testName: row.testName,
    category: row.category,
    price: minorUnitPrice,
    tatText: row.tat,
    availability: row.available ? "available" : "unavailable",
    notes: row.notes,
    isNewTest,
  };
}
