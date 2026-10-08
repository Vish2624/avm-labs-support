/**
 * Static WhatsApp message wording. generate-response.ts fills these with
 * verified DB fields (test name, price, TAT, availability) — the
 * templates themselves never carry placeholder or invented data.
 */
export const WHATSAPP_TEMPLATES = {
  intro: (customerName: string | null) =>
    customerName
      ? `Thank you for waiting, ${customerName}.\nHere are the details you asked for:`
      : "Thank you for waiting.\nHere are the details you asked for:",
  // `tat` and `availability` are omitted (pass null) when that detail is
  // shown once for the whole quotation instead, or is the unremarkable
  // "Available" default not worth repeating to the customer. The test code
  // is internal — the customer sees the name only.
  lineItem: (
    index: number,
    name: string,
    price: string,
    tat: string | null,
    availability: string | null,
    includes: string | null = null
  ) => {
    const parts = [`${index}. ${name}`];
    if (includes) parts.push(`   Includes: ${includes}`);
    parts.push(`   Price: ${price}`);
    if (tat) parts.push(`   Report within: ${tat}`);
    if (availability) parts.push(`   Availability: ${availability}`);
    return parts.join("\n");
  },
  // Summary reply: names only, one overall price.
  summaryLine: (index: number, name: string, availability: string | null) =>
    availability ? `${index}. ${name} (${availability})` : `${index}. ${name}`,
  tat: (value: string) => `Reports will be released within ${value}.`,
  subtotal: (amount: string) => `Subtotal: ${amount}`,
  discount: (percent: number, amount: string) => `Discount (${percent}%): -${amount}`,
  total: (amount: string) => `Total: ${amount}`,
  totalWithDiscount: (amount: string, percent: number) => `Total: ${amount} (${percent}% discount included)`,
  // Saudi branches (Riyadh, Khobar) only: VAT is mentioned, never added to the price.
  ksaVat: ["VAT 15% is applicable to non-citizens.*", "If the patient is a citizen, no VAT will be applicable."],
  breakupOffer: "Would you like the price breakup for each test? Just let us know.",
  outro: "Please let us know if you'd like to proceed with booking.",
  empty: "No tests have been added to this quotation yet.",
} as const;
