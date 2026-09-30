import { formatCurrency } from "@/lib/utils/format-currency";
import { formatTat } from "@/lib/utils/format-tat";
import { parseTatHours } from "@/lib/utils/parse-tat-hours";
import { applyDiscount } from "@/lib/pricing/discount";
import { AVAILABILITY_LABELS } from "@/lib/constants/availability";
import { WHATSAPP_TEMPLATES } from "./templates";
import type { Quotation, QuotationLineItem } from "@/types/quotation";

// Past this many component tests, naming them all makes the reply a wall
// of text — the count alone is enough, and the agent can list them on request.
const MAX_NAMED_PACKAGE_TESTS = 6;

function describePackageContents(item: QuotationLineItem): string | null {
  if (item.kind !== "package" || item.tests.length === 0) return null;
  const count = `${item.tests.length} test${item.tests.length === 1 ? "" : "s"}`;
  if (item.tests.length > MAX_NAMED_PACKAGE_TESTS) return count;
  return `${count} (${item.tests.map((test) => test.officialName).join(", ")})`;
}

/** The shortest report time promised to a customer, however fast the test itself is. */
const MIN_CUSTOMER_TAT_HOURS = 12;

/**
 * A TAT as the customer is told it: never under 12 hrs, up to 24 in hours,
 * beyond that in whole days ("4 hrs" -> "12 hrs", "48 hrs" -> "2 days",
 * "72 hrs" -> "3 days"). Text that can't be read as a duration is passed
 * through as stored rather than guessed at.
 */
export function customerTat(tatText: string): string {
  const hours = parseTatHours(tatText);
  if (hours === null) return formatTat(tatText);
  if (hours <= 24) return `${Math.max(hours, MIN_CUSTOMER_TAT_HOURS)} hrs`;
  const days = Math.ceil(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

/**
 * - detailed: every test with its own price, then the total
 * - summary: the test names and one overall price, offering the breakup on request
 */
export type ReplyStyle = "detailed" | "summary";

/**
 * Format a quotation's verified DB fields into a copy-ready WhatsApp
 * message. Every value comes from the quotation's line items — themselves
 * built only from searchTests()/findMatchingProfiles() results — so nothing
 * here is generated or guessed.
 */
export function generateWhatsAppResponse(quotation: Quotation, style: ReplyStyle = "detailed"): string {
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
    sharedTat = customerTat(uniqueTats[0]);
  } else {
    const parsedHours = tatTexts.map(parseTatHours);
    if (parsedHours.every((hours): hours is number => hours !== null)) {
      const slowestIndex = parsedHours.indexOf(Math.max(...parsedHours));
      sharedTat = customerTat(tatTexts[slowestIndex]);
    }
  }

  const { tier, discountAmount, discountedTotal } = applyDiscount(quotation.total);

  if (style === "summary") {
    // Names only; a TAT that can't be summarized (differing free-text
    // formats) goes next to each name rather than being guessed at.
    const names = quotation.lineItems.map((item, index) =>
      WHATSAPP_TEMPLATES.summaryLine(
        index + 1,
        sharedTat ? item.name : `${item.name} — report within ${customerTat(item.tatText)}`,
        item.availability === "available" ? null : AVAILABILITY_LABELS[item.availability]
      )
    );
    return [
      WHATSAPP_TEMPLATES.intro(quotation.customerName?.trim() || null),
      "",
      ...names,
      "",
      ...(sharedTat ? [WHATSAPP_TEMPLATES.tat(sharedTat)] : []),
      tier
        ? WHATSAPP_TEMPLATES.totalWithDiscount(formatCurrency(discountedTotal), tier.percent)
        : WHATSAPP_TEMPLATES.total(formatCurrency(quotation.total)),
      "",
      WHATSAPP_TEMPLATES.breakupOffer,
      WHATSAPP_TEMPLATES.outro,
    ].join("\n");
  }

  const lines = quotation.lineItems.map((item, index) =>
    WHATSAPP_TEMPLATES.lineItem(
      index + 1,
      item.name,
      formatCurrency(item.price),
      sharedTat ? null : customerTat(item.tatText),
      // "Available" is the unremarkable default — only worth telling the
      // customer when a test isn't.
      item.availability === "available" ? null : AVAILABILITY_LABELS[item.availability],
      describePackageContents(item)
    )
  );

  const totalLines = tier
    ? [
        WHATSAPP_TEMPLATES.subtotal(formatCurrency(quotation.total)),
        WHATSAPP_TEMPLATES.discount(tier.percent, formatCurrency(discountAmount)),
        WHATSAPP_TEMPLATES.total(formatCurrency(discountedTotal)),
      ]
    : [WHATSAPP_TEMPLATES.total(formatCurrency(quotation.total))];

  return [
    WHATSAPP_TEMPLATES.intro(quotation.customerName?.trim() || null),
    "",
    ...lines,
    "",
    ...(sharedTat ? [WHATSAPP_TEMPLATES.tat(sharedTat), ""] : []),
    ...totalLines,
    "",
    WHATSAPP_TEMPLATES.outro,
  ].join("\n");
}
