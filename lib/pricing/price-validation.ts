/**
 * TODO: Validate a price/TAT/availability lookup actually resolved to a
 * verified, current (test + location + service_type + active version) row
 * before it's allowed into a quotation or WhatsApp response — the guardrail
 * behind "never guess a price."
 */
export function assertVerifiedPrice(): never {
  throw new Error("Not implemented: assertVerifiedPrice");
}
