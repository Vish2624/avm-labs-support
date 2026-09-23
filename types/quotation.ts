import type { Money } from "@/lib/pricing/money";
import type { ServiceType } from "@/lib/constants/service-types";
import type { AvailabilityStatus } from "@/lib/constants/availability";
import type { ProfileTestSummary } from "@/types/profile";

/**
 * Fields every quotation line carries, whether it's a single test or a
 * package. Every value is copied from a verified database record at the
 * time it was added — never freehand text.
 */
interface QuotationLineBase {
  code: string;
  name: string;
  price: Money;
  tatText: string;
  serviceType: ServiceType;
  availability: AvailabilityStatus;
}

/** A single test, priced from its current `test_prices` row. */
export interface QuotationTestLine extends QuotationLineBase {
  kind: "test";
  testId: string;
}

/**
 * A package (profile), priced at its fixed `profile_prices` bundle price —
 * never computed from its component tests' prices.
 */
export interface QuotationPackageLine extends QuotationLineBase {
  kind: "package";
  profileId: string;
  tests: ProfileTestSummary[];
}

export type QuotationLineItem = QuotationTestLine | QuotationPackageLine;

/** Stable React key / identity for a line, unique across both kinds. */
export function lineItemKey(item: QuotationLineItem): string {
  return item.kind === "test" ? `test:${item.testId}` : `package:${item.profileId}`;
}

export interface Quotation {
  locationId: string;
  lineItems: QuotationLineItem[];
  total: Money;
  /** Optional customer first name for the reply's greeting. */
  customerName?: string;
}
