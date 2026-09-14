/**
 * Static WhatsApp message wording. generate-response.ts fills these with
 * verified DB fields (test name/code, price, TAT, availability) — the
 * templates themselves never carry placeholder or invented data.
 */
export const WHATSAPP_TEMPLATES = {
  intro: "Hi! Here are the details for your requested tests:",
  // `tat` and `availability` are omitted (pass null) when that detail is
  // shown once for the whole quotation instead, or is the unremarkable
  // "Available" default not worth repeating to the customer.
  lineItem: (
    index: number,
    name: string,
    code: string,
    price: string,
    tat: string | null,
    availability: string | null
  ) => {
    const parts = [`${index}. ${name} (${code})`, `   Price: ${price}`];
    if (tat) parts.push(`   TAT: ${tat}`);
    if (availability) parts.push(`   Availability: ${availability}`);
    return parts.join("\n");
  },
  tat: (value: string) => `TAT: ${value}`,
  subtotal: (amount: string) => `Subtotal: ${amount}`,
  discount: (percent: number, amount: string) => `Discount (${percent}%): -${amount}`,
  total: (amount: string) => `Total: ${amount}`,
  outro: "Please let us know if you'd like to proceed with booking.",
  empty: "No tests have been added to this quotation yet.",
} as const;
