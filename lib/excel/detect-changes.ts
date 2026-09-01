import type { ParsedPriceRow, ImportDiff, ImportDiffRow } from "@/types/import";
import type { AvailabilityStatus } from "@/lib/constants/availability";

/** A percent change at or beyond this magnitude is flagged as a "large price change" warning. */
export const LARGE_CHANGE_THRESHOLD_PERCENT = 20;

export interface CurrentPriceSnapshot {
  price: number; // minor units
  currencyCode: string;
  tatText: string;
  availability: AvailabilityStatus;
}

/**
 * Diffs staged rows against the currently active prices for the same
 * location/service type — new tests, newly-priced existing tests, changed
 * rows, and unchanged rows — for the activation preview screen. Pure: the
 * caller supplies each row's current price (keyed by test code), fetched
 * from test_prices for exactly the tests referenced in this upload; a code
 * with no entry there is either a brand-new test or an existing test not
 * previously priced at this location/service type (both "no previous row"
 * cases, distinguished by ParsedPriceRow.isNewTest).
 */
export function detectChanges(
  rows: ParsedPriceRow[],
  currentPricesByCode: Map<string, CurrentPriceSnapshot>,
  locationCurrencyCode: string
): ImportDiff {
  const diffRows: ImportDiffRow[] = rows.map((row) => {
    const previous = currentPricesByCode.get(row.testCode.trim().toUpperCase()) ?? null;
    const next = {
      price: row.price,
      currencyCode: locationCurrencyCode,
      tatText: row.tatText,
      availability: row.availability,
    };

    if (row.isNewTest) {
      return { testCode: row.testCode, testName: row.testName, status: "new_test", previous: null, next, priceChangePercent: null };
    }
    if (!previous) {
      return { testCode: row.testCode, testName: row.testName, status: "new_price", previous: null, next, priceChangePercent: null };
    }

    const changed =
      previous.price !== next.price || previous.tatText !== next.tatText || previous.availability !== next.availability;
    const priceChangePercent =
      previous.price === 0 ? null : Math.round(((next.price - previous.price) / previous.price) * 100);

    return {
      testCode: row.testCode,
      testName: row.testName,
      status: changed ? "changed" : "unchanged",
      previous,
      next,
      priceChangePercent,
    };
  });

  return {
    newTestCount: diffRows.filter((row) => row.status === "new_test").length,
    newPriceCount: diffRows.filter((row) => row.status === "new_price").length,
    changedCount: diffRows.filter((row) => row.status === "changed").length,
    unchangedCount: diffRows.filter((row) => row.status === "unchanged").length,
    rows: diffRows,
  };
}

export function isLargePriceChange(percent: number | null): boolean {
  return percent !== null && Math.abs(percent) >= LARGE_CHANGE_THRESHOLD_PERCENT;
}
