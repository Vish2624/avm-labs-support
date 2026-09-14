import type { Money } from "@/lib/pricing/money";
import type { ServiceType } from "@/lib/constants/service-types";
import type { AvailabilityStatus } from "@/lib/constants/availability";

/**
 * A single test added to the in-progress quotation in the Support
 * Workspace. Every field is copied from a verified database record at the
 * time it was added — never freehand text.
 */
export interface QuotationLineItem {
  testId: string;
  testCode: string;
  testName: string;
  price: Money;
  tatText: string;
  serviceType: ServiceType;
  availability: AvailabilityStatus;
}

export interface Quotation {
  locationId: string;
  lineItems: QuotationLineItem[];
  total: Money;
}
