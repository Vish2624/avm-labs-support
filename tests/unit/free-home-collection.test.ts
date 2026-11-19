import { test } from "node:test";
import assert from "node:assert/strict";
import { quoteDiscount } from "@/lib/pricing/discount";
import { generateWhatsAppResponse } from "@/lib/whatsapp/generate-response";
import type { Quotation } from "@/types/quotation";

// Dummy prices (fils), never real AVM data. 40 BHD reaches the 20% tier.
const bhd = (amount: number) => ({ amount, currency: "BHD" });
const quotation = (freeHomeCollection: boolean): Quotation => ({
  locationId: "bah",
  total: bhd(40_000),
  freeHomeCollection,
  lineItems: [
    {
      kind: "package",
      profileId: "p",
      code: "P1",
      name: "Some Profile",
      price: bhd(30_000),
      tatText: "24 hrs",
      serviceType: "in_house",
      availability: "available",
      tests: [],
    },
    {
      kind: "test",
      testId: "t",
      code: "T1",
      name: "Some Test",
      price: bhd(10_000),
      tatText: "24 hrs",
      serviceType: "in_house",
      availability: "available",
    },
  ],
});

test("a quote with a free home collection profile gets no volume discount", () => {
  const { tier, discountedTotal } = quoteDiscount(quotation(true));
  assert.equal(tier, null);
  assert.deepEqual(discountedTotal, bhd(40_000));
  assert.equal(quoteDiscount(quotation(false)).tier?.percent, 20);
});

test("the reply says home collection is free instead of a discount", () => {
  for (const style of ["detailed", "summary"] as const) {
    const reply = generateWhatsAppResponse(quotation(true), style);
    assert.match(reply, /Home collection is free\./);
    assert.doesNotMatch(reply, /discount/i);
  }
  assert.doesNotMatch(generateWhatsAppResponse(quotation(false), "detailed"), /Home collection is free/);
});
