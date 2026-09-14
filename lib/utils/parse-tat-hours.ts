/**
 * Best-effort duration extraction from TAT free text (see `format-tat.ts`),
 * used only to compare TATs *within one quotation* so the WhatsApp reply can
 * mention the slowest one once instead of repeating it per test. Returns
 * hours, or null when the text doesn't match a recognized pattern —
 * callers must treat null as "can't compare," never guess an ordering.
 */
export function parseTatHours(tatText: string): number | null {
  const text = tatText.trim().toLowerCase();

  if (/^same[\s-]?day$/.test(text)) return 24;

  const hoursMatch = text.match(/(\d+)\s*(?:hrs?|hours?)\b/);
  if (hoursMatch) return Number(hoursMatch[1]);

  // "3 working days" / "2-3 working days" — an inclusive range uses its
  // upper bound, since that's the customer's worst-case wait.
  const daysMatch = text.match(/(\d+)(?:\s*-\s*(\d+))?\s*(?:working\s*)?days?\b/);
  if (daysMatch) {
    const upperBound = daysMatch[2] ? Number(daysMatch[2]) : Number(daysMatch[1]);
    return upperBound * 24;
  }

  return null;
}
