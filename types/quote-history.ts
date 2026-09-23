import type { Money } from "@/lib/pricing/money";
import type { ServiceType } from "@/lib/constants/service-types";

/** How long a saved quote stays in History before it expires. */
export const QUOTE_HISTORY_RETENTION_DAYS = 2;

/**
 * One quoted line as it was at the time the reply was copied — a
 * historical snapshot, not a live price. `refId` is the test id (kind
 * "test") or profile id (kind "package"), used to re-price on reopen.
 */
export interface QuoteHistoryLine {
  kind: "test" | "package";
  refId: string;
  code: string;
  name: string;
  serviceType: ServiceType;
  price: Money;
}

/** Mirrors `quote_history`. */
export interface QuoteHistoryEntry {
  id: string;
  createdAt: string;
  locationId: string;
  customerName: string | null;
  lineItems: QuoteHistoryLine[];
  subtotal: Money;
  discountPercent: number;
  total: Money;
  replyText: string;
}

export interface QuoteHistoryInput {
  locationId: string;
  customerName: string | null;
  lineItems: QuoteHistoryLine[];
  subtotal: Money;
  discountPercent: number;
  total: Money;
  replyText: string;
}
