/**
 * Safe money arithmetic. Amounts are always integers in the currency's
 * minor unit (fils/halalas) — never floating point — so quotation totals
 * can't drift from rounding error. Floating point only ever appears at the
 * final display boundary (formatCurrency in lib/utils/format-currency.ts).
 */

export interface Money {
  /** Integer amount in the currency's minor unit, e.g. 12550 = 125.50 AED. */
  amount: number;
  /** ISO 4217 code, e.g. "AED", "SAR", "BHD". */
  currency: string;
}

// AED and SAR use 2 decimal places (fils/halalas); BHD uses 3 (fils).
// This is standard ISO 4217 data, not business pricing data.
const CURRENCY_FRACTION_DIGITS: Record<string, number> = {
  AED: 2,
  SAR: 2,
  BHD: 3,
};

export function getCurrencyFractionDigits(currency: string): number {
  return CURRENCY_FRACTION_DIGITS[currency] ?? 2;
}

function assertSameCurrency(a: Money, b: Money) {
  if (a.currency !== b.currency) {
    throw new Error(
      `Cannot combine amounts in different currencies: ${a.currency} vs ${b.currency}.`
    );
  }
}

function assertIntegerAmount(money: Money) {
  if (!Number.isInteger(money.amount)) {
    throw new Error(
      `Money.amount must be an integer minor-unit value, got ${money.amount} for ${money.currency}.`
    );
  }
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  assertIntegerAmount(a);
  assertIntegerAmount(b);
  return { amount: a.amount + b.amount, currency: a.currency };
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  assertIntegerAmount(a);
  assertIntegerAmount(b);
  return { amount: a.amount - b.amount, currency: a.currency };
}

export function sumMoney(amounts: Money[], currency: string): Money {
  return amounts.reduce((total, m) => addMoney(total, m), { amount: 0, currency });
}

/** Multiply a price by a non-negative integer quantity (e.g. line-item qty). */
export function multiplyMoney(a: Money, quantity: number): Money {
  assertIntegerAmount(a);
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new Error("multiplyMoney only supports non-negative integer quantities.");
  }
  return { amount: a.amount * quantity, currency: a.currency };
}

export function isZeroMoney(a: Money): boolean {
  return a.amount === 0;
}

/** Minor units -> decimal string for display, e.g. 12550 -> "125.50". */
export function formatMinorUnits(amount: number, decimals: number): string {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount).toString().padStart(decimals + 1, "0");
  const whole = abs.slice(0, abs.length - decimals) || "0";
  const fraction = decimals > 0 ? "." + abs.slice(abs.length - decimals) : "";
  return `${sign}${whole}${fraction}`;
}
