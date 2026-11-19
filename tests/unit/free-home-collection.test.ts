import { test } from "node:test";
import assert from "node:assert/strict";
import { generateWhatsAppResponse } from "@/lib/whatsapp/generate-response";
import type { Quotation } from "@/types/quotation";

// Dummy prices (fils), never real AVM data.
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

test("the reply shows the full total with no discount line", () => {
  for (const freeHomeCollection of [true, false]) {
    for (const style of ["detailed", "summary"] as const) {
      const reply = generateWhatsAppResponse(quotation(freeHomeCollection), style);
      assert.match(reply, /Total: BHD 40\.000|Total: 40\.000 BHD/);
      assert.doesNotMatch(reply, /discount|subtotal/i);
    }
  }
});

test("the reply says home collection is free with a free home collection profile", () => {
  for (const style of ["detailed", "summary"] as const) {
    const reply = generateWhatsAppResponse(quotation(true), style);
    assert.match(reply, /Home collection is free\./);
  }
  assert.doesNotMatch(generateWhatsAppResponse(quotation(false), "detailed"), /Home collection is free/);
});
