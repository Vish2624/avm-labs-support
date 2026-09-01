"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SelectedTests } from "./selected-tests";
import { WhatsappResponse } from "./whatsapp-response";
import { formatCurrency } from "@/lib/utils/format-currency";
import type { Quotation } from "@/types/quotation";

// Totals, currency, and generated reply for the in-progress quotation.
export function QuotationPanel({
  quotation,
  whatsappMessage,
  onRemove,
}: {
  quotation: Quotation;
  whatsappMessage: string;
  onRemove: (testId: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Quotation</span>
          <span className="text-base font-semibold">{formatCurrency(quotation.total)}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <SelectedTests lineItems={quotation.lineItems} onRemove={onRemove} />
        <Separator />
        <WhatsappResponse message={whatsappMessage} disabled={quotation.lineItems.length === 0} />
      </CardContent>
    </Card>
  );
}
