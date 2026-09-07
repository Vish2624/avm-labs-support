"use client";

import { Trash2, TriangleAlert, ReceiptText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { SelectedTests } from "./selected-tests";
import { WhatsappResponse } from "./whatsapp-response";
import { formatCurrency } from "@/lib/utils/format-currency";
import { AVAILABILITY_LABELS } from "@/lib/constants/availability";
import type { Quotation } from "@/types/quotation";

// Totals, currency, and generated reply for the in-progress quotation.
export function QuotationPanel({
  quotation,
  whatsappMessage,
  context,
  onRemove,
  onClear,
}: {
  quotation: Quotation;
  whatsappMessage: string;
  context: string | null;
  onRemove: (testId: string) => void;
  onClear: () => void;
}) {
  const count = quotation.lineItems.length;
  const flagged = quotation.lineItems.filter((item) => item.availability !== "available");

  return (
    <Card className="border-glass-border bg-glass shadow-glass backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-full bg-primary/15 text-primary">
              <ReceiptText className="size-3.5" />
            </span>
            Quotation
            <span className="text-sm font-normal text-muted-foreground">
              {count} test{count === 1 ? "" : "s"}
            </span>
          </span>
          {count > 0 ? (
            <Button type="button" size="xs" variant="ghost" onClick={onClear}>
              <Trash2 />
              Clear all
            </Button>
          ) : null}
        </CardTitle>
        {context ? <p className="text-xs text-muted-foreground">{context}</p> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3">
          <span className="text-sm font-medium text-muted-foreground">Total</span>
          <span className="text-2xl font-semibold tabular-nums text-primary">
            {formatCurrency(quotation.total)}
          </span>
        </div>
        {flagged.length > 0 ? (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertDescription>
              {flagged.length} item{flagged.length === 1 ? "" : "s"} not fully available —{" "}
              {flagged
                .map((item) => `${item.testName} (${AVAILABILITY_LABELS[item.availability]})`)
                .join(", ")}
              . Check before sending the quote.
            </AlertDescription>
          </Alert>
        ) : null}
        <SelectedTests lineItems={quotation.lineItems} onRemove={onRemove} />
        <Separator />
        <WhatsappResponse message={whatsappMessage} disabled={count === 0} />
      </CardContent>
    </Card>
  );
}
