"use client";

import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Test</TableHead>
          <TableHead>TAT</TableHead>
          <TableHead>Availability</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {lineItems.map((item) => (
          <QuotationRow key={item.testId} item={item} onRemove={onRemove} />
        ))}
      </TableBody>
    </Table>
  );
}
