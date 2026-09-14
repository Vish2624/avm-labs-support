import { cn } from "@/lib/utils";
import { formatMinorUnits, getCurrencyFractionDigits } from "@/lib/pricing/money";
import { getDiscountTiers } from "@/lib/pricing/discount";

function formatTierThreshold(thresholdMinor: number, currency: string): string {
  const decimals = getCurrencyFractionDigits(currency);
  const full = formatMinorUnits(thresholdMinor, decimals);
  // "19.000" -> "19" (whole-number thresholds read cleaner without the
  // decimals); "185.58" is left as-is since the fraction isn't all zero.
  return `${full.replace(/\.0+$/, "")} ${currency}+`;
}

// The volume-discount ladder (see lib/constants/discount-tiers.ts), shown
// as a row of tier chips in the quotation panel only — pass
// `achievedPercent` (the quotation's own applicable tier) to highlight
// which tier the cart has already reached.
export function DiscountTiers({
  currency,
  achievedPercent,
  className,
}: {
  currency: string;
  achievedPercent?: number;
  className?: string;
}) {
  const tiers = getDiscountTiers(currency);
  if (tiers.length === 0) return null;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="shrink-0 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        Discount
      </span>
      <div className="flex items-center gap-1.5">
        {tiers.map((tier) => {
          const achieved = achievedPercent !== undefined && achievedPercent >= tier.percent;
          return (
            <div
              key={tier.percent}
              className={cn(
                "flex flex-col items-center gap-1 rounded-[10px] border px-2.5 py-1.5 leading-none",
                achieved ? "border-success bg-success/10" : "border-border bg-muted/40"
              )}
            >
              <span
                className={cn(
                  "text-[13px] font-bold tabular-nums",
                  achieved ? "text-success-foreground" : "text-primary"
                )}
              >
                {tier.percent}%
              </span>
              <span
                className={cn(
                  "text-[10.5px] font-medium tabular-nums",
                  achieved ? "text-success-foreground/80" : "text-muted-foreground"
                )}
              >
                {formatTierThreshold(tier.thresholdMinor, currency)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
