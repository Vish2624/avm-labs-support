import { formatCurrency } from "@/lib/utils/format-currency";
import { formatTat } from "@/lib/utils/format-tat";
import { parseTatHours } from "@/lib/utils/parse-tat-hours";
import { applyDiscount } from "@/lib/pricing/discount";
import { AVAILABILITY_LABELS } from "@/lib/constants/availability";
import { WHATSAPP_TEMPLATES } from "./templates";
import type { Quotation } from "@/types/quotation";

/**
 * Format a quotation's verified DB fields into a copy-ready WhatsApp
 * message. Every value comes from the quotation's line items — themselves
 * built only from searchTests()/findMatchingProfiles() results — so nothing
 * here is generated or guessed.
 */
export function generateWhatsAppResponse(quotation: Quotation): string {
  if (quotation.lineItems.length === 0) {
    return WHATSAPP_TEMPLATES.empty;
  }

  const tatTexts = quotation.lineItems.map((item) => formatTat(item.tatText));
  const uniqueTats = Array.from(new Set(tatTexts));

  // Repeating an identical TAT on every line is just noise, and when TATs
  // differ, the customer only needs the slowest one — the whole quotation
  // isn't ready until that test is. Fall back to a per-line TAT only when
  // values differ AND can't be confidently compared (unrecognized
  // free-text format): we never guess at an ordering we can't support.
  let sharedTat: string | null = null;
  if (uniqueTats.length === 1) {
    sharedTat = uniqueTats[0];
  } else {
    const parsedHours = tatTexts.map(parseTatHours);
    if (parsedHours.every((hours): hours is number => hours !== null)) {
      const slowestIndex = parsedHours.indexOf(Math.max(...parsedHours));
      sharedTat = tatTexts[slowestIndex];
    }
  }

  const lines = quotation.lineItems.map((item, index) =>
    WHATSAPP_TEMPLATES.lineItem(
      index + 1,
      item.testName,
      item.testCode,
      formatCurrency(item.price),
      sharedTat ? null : formatTat(item.tatText),
      // "Available" is the unremarkable default — only worth telling the
      // customer when a test isn't.
      item.availability === "available" ? null : AVAILABILITY_LABELS[item.availability]
    )
  );

  const { tier, discountAmount, discountedTotal } = applyDiscount(quotation.total);
  const totalLines = tier
    ? [
        WHATSAPP_TEMPLATES.subtotal(formatCurrency(quotation.total)),
        WHATSAPP_TEMPLATES.discount(tier.percent, formatCurrency(discountAmount)),
        WHATSAPP_TEMPLATES.total(formatCurrency(discountedTotal)),
      ]
    : [WHATSAPP_TEMPLATES.total(formatCurrency(quotation.total))];

  return [
    WHATSAPP_TEMPLATES.intro,
    "",
    ...lines,
    "",
    ...(sharedTat ? [WHATSAPP_TEMPLATES.tat(sharedTat), ""] : []),
    ...totalLines,
    "",
    WHATSAPP_TEMPLATES.outro,
  ].join("\n");
}
