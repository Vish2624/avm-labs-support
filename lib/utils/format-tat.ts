/**
 * TAT is stored as verified free text on test_prices (e.g. "Same day",
 * "24 hours", "3-5 working days") — never computed or guessed. This just
 * normalizes display of a value that may be missing.
 */
export function formatTat(tatText: string | null | undefined): string {
  const trimmed = tatText?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "TAT not set";
}
