"use client";

import { QuotationRow } from "./quotation-row";
import type { QuotationLineItem } from "@/types/quotation";

// Tests added to the current quotation.
export function SelectedTests({
  lineItems,
  onRemove,
}: {
  lineItems: QuotationLineItem[];
  onRemove: (testId: string) => void;
}) {
  if (lineItems.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No tests selected — search for a test above and add it to the quotation.
      </p>
    );
  }

  // Searching "All" can add both in-house and outsourced tests to one
  // quote — only then does each row need to say which it is.
  const mixedServiceTypes = new Set(lineItems.map((item) => item.serviceType)).size > 1;

  return (
    <div className="flex flex-col">
      {lineItems.map((item) => (
        <QuotationRow key={item.testId} item={item} onRemove={onRemove} showServiceType={mixedServiceTypes} />
      ))}
    </div>
  );
}
