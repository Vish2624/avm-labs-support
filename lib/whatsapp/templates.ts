/**
 * Static WhatsApp message wording. generate-response.ts fills these with
 * verified DB fields (test name/code, price, TAT, availability) — the
 * templates themselves never carry placeholder or invented data.
 */
export const WHATSAPP_TEMPLATES = {
  intro: "Hi! Here are the details for your requested tests:",
  lineItem: (
    index: number,
    name: string,
    code: string,
    price: string,
    tat: string,
    availability: string
  ) => `${index}. ${name} (${code})\n   Price: ${price}\n   TAT: ${tat}\n   Availability: ${availability}`,
  total: (amount: string) => `Total: ${amount}`,
  outro: "Please let us know if you'd like to proceed with booking.",
  empty: "No tests have been added to this quotation yet.",
} as const;
