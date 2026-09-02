"use client";

import { Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SelectedTests } from "./selected-tests";
import { WhatsappResponse } from "./whatsapp-response";
import { formatCurrency } from "@/lib/utils/format-currency";
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

  return (
    <Card className="border-glass-border bg-glass shadow-glass backdrop-blur-2xl">
      <CardHeader>
        <CardTitle className="flex items-baseline justify-between gap-3">
          <span>
            Quotation
            <span className="ml-1.5 text-sm font-normal text-muted-foreground">
              {count} test{count === 1 ? "" : "s"}
            </span>
          </span>
          <span className="text-base font-semibold tabular-nums">{formatCurrency(quotation.total)}</span>
        </CardTitle>
        <div className="flex items-center justify-between gap-3">
          {context ? <p className="text-xs text-muted-foreground">{context}</p> : <span />}
          {count > 0 ? (
            <Button type="button" size="xs" variant="ghost" onClick={onClear}>
              <Trash2 />
              Clear all
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <SelectedTests lineItems={quotation.lineItems} onRemove={onRemove} />
        <Separator />
        <WhatsappResponse message={whatsappMessage} disabled={count === 0} />
      </CardContent>
    </Card>
  );
}
