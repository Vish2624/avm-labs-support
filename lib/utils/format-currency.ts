import { formatMinorUnits, getCurrencyFractionDigits, type Money } from "@/lib/pricing/money";

/**
 * Formats a Money value for display with the currency code last, e.g.
 * { amount: 12550, currency: "AED" } -> "125.50 AED", { amount: 1250,
 * currency: "BHD" } -> "1.250 BHD" — everywhere a price is shown, including
 * the WhatsApp reply. Falls back to plain minor-unit formatting if the
 * runtime's Intl can't format the number.
 */
export function formatCurrency(money: Money, locale = "en-GB"): string {
  const decimals = getCurrencyFractionDigits(money.currency);
  const decimalValue = money.amount / 10 ** decimals;

  try {
    const amount = new Intl.NumberFormat(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(decimalValue);
    return `${amount} ${money.currency}`;
  } catch {
    return `${formatMinorUnits(money.amount, decimals)} ${money.currency}`;
  }
}
