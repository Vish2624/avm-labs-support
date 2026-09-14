import { DISCOUNT_TIERS, type DiscountTier } from "@/lib/constants/discount-tiers";
import type { Money } from "./money";

/** The tiers for a currency, ascending by threshold — [] if unsupported. */
export function getDiscountTiers(currency: string): DiscountTier[] {
  return DISCOUNT_TIERS[currency] ?? [];
}

/** The best (highest-percent) tier `total` currently qualifies for, or null. */
export function getApplicableDiscountTier(total: Money): DiscountTier | null {
  let applicable: DiscountTier | null = null;
  for (const tier of getDiscountTiers(total.currency)) {
    if (total.amount >= tier.thresholdMinor) applicable = tier;
  }
  return applicable;
}

export interface DiscountResult {
  tier: DiscountTier | null;
  /** { amount: 0, currency } when no tier applies. */
  discountAmount: Money;
  /** Equals `total` when no tier applies. */
  discountedTotal: Money;
}

/** Applies the best qualifying tier to `total`. Never mutates `total`. */
export function applyDiscount(total: Money): DiscountResult {
  const tier = getApplicableDiscountTier(total);
  if (!tier) {
    return {
      tier: null,
      discountAmount: { amount: 0, currency: total.currency },
      discountedTotal: total,
    };
  }
  const discountAmount = Math.round((total.amount * tier.percent) / 100);
  return {
    tier,
    discountAmount: { amount: discountAmount, currency: total.currency },
    discountedTotal: { amount: total.amount - discountAmount, currency: total.currency },
  };
}
