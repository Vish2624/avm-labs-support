/**
 * Volume discount ladder: spend >= a tier's threshold on the quotation
 * total, get that tier's % off. One global rule (not per-test, not
 * per-location) — confirmed with the business owner 2026-09-14.
 *
 * Base rule is BHD 19 -> 10%, BHD 38 -> 20%. The other currencies are that
 * same rule converted at each currency's official fixed USD peg (not
 * independently invented numbers): BHD 0.376/USD, AED 3.6725/USD,
 * SAR 3.75/USD. Amounts are minor units (fils/halalas), matching `Money`.
 */
export interface DiscountTier {
  /** Minimum quotation total, in the currency's minor unit, to qualify. */
  thresholdMinor: number;
  /** Percent off the whole quotation total, e.g. 10 for 10%. */
  percent: number;
}

export const DISCOUNT_TIERS: Record<string, DiscountTier[]> = {
  BHD: [
    { thresholdMinor: 19_000, percent: 10 },
    { thresholdMinor: 38_000, percent: 20 },
  ],
  // 19/38 BHD converted at 1 BHD = 9.767287 AED (3.6725 / 0.376).
  AED: [
    { thresholdMinor: 18_558, percent: 10 },
    { thresholdMinor: 37_116, percent: 20 },
  ],
  // 19/38 BHD converted at 1 BHD = 9.973404 SAR (3.75 / 0.376).
  SAR: [
    { thresholdMinor: 18_949, percent: 10 },
    { thresholdMinor: 37_899, percent: 20 },
  ],
};
