/**
 * Volume discount ladder: spend >= a tier's threshold on the quotation
 * total, get that tier's % off. One global rule (not per-test, not
 * per-location) — confirmed with the business owner 2026-09-14.
 *
 * Each currency's thresholds are set by the business (last updated
 * 2026-09-28). Amounts are minor units (fils/halalas), matching `Money`.
 */
export interface DiscountTier {
  /** Minimum quotation total, in the currency's minor unit, to qualify. */
  thresholdMinor: number;
  /** Percent off the whole quotation total, e.g. 10 for 10%. */
  percent: number;
}

export const DISCOUNT_TIERS: Record<string, DiscountTier[]> = {
  // Bahrain: set by the business 2026-09-28 — 18.750+ BHD = 10%, 37.500+ BHD = 20%.
  BHD: [
    { thresholdMinor: 18_750, percent: 10 },
    { thresholdMinor: 37_500, percent: 20 },
  ],
  // Dubai: set by the business 2026-09-28 — 183+ AED = 10%, 365+ AED = 20%.
  AED: [
    { thresholdMinor: 18_300, percent: 10 },
    { thresholdMinor: 36_500, percent: 20 },
  ],
  // K.S.A. (Riyadh, Khobar): set by the business 2026-09-28 —
  // 186.60+ SAR = 10%, 373.10+ SAR = 20%.
  SAR: [
    { thresholdMinor: 18_660, percent: 10 },
    { thresholdMinor: 37_310, percent: 20 },
  ],
};
