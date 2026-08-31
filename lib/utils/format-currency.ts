import { formatMinorUnits, getCurrencyFractionDigits, type Money } from "@/lib/pricing/money";

/**
 * Formats a Money value for display, e.g. { amount: 12550, currency: "AED" }
 * -> "AED 125.50". Falls back to a plain "CODE amount" format if the
 * runtime's Intl doesn't recognize the currency code.
 */
export function formatCurrency(money: Money, locale = "en-GB"): string {
  const decimals = getCurrencyFractionDigits(money.currency);
  const decimalValue = money.amount / 10 ** decimals;

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: money.currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(decimalValue);
  } catch {
    return `${money.currency} ${formatMinorUnits(money.amount, decimals)}`;
  }
}
