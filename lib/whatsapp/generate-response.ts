import { formatCurrency } from "@/lib/utils/format-currency";
import { formatTat } from "@/lib/utils/format-tat";
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

  const lines = quotation.lineItems.map((item, index) =>
    WHATSAPP_TEMPLATES.lineItem(
      index + 1,
      item.testName,
      item.testCode,
      formatCurrency(item.price),
      formatTat(item.tatText),
      AVAILABILITY_LABELS[item.availability]
    )
  );

  return [
    WHATSAPP_TEMPLATES.intro,
    "",
    ...lines,
    "",
    WHATSAPP_TEMPLATES.total(formatCurrency(quotation.total)),
    "",
    WHATSAPP_TEMPLATES.outro,
  ].join("\n");
}
