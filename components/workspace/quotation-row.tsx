"use client";

import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils/format-currency";
import { formatTat } from "@/lib/utils/format-tat";
import { AVAILABILITY_LABELS } from "@/lib/constants/availability";
import type { QuotationLineItem } from "@/types/quotation";

const AVAILABILITY_BADGE_VARIANT = {
  available: "secondary",
  unavailable: "destructive",
  temporarily_unavailable: "outline",
} as const;

// One line item in the quotation table (name, code, price, TAT, availability, remove).
export function QuotationRow({
  item,
  onRemove,
}: {
  item: QuotationLineItem;
  onRemove: (testId: string) => void;
}) {
  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{item.testName}</div>
        <div className="text-xs text-muted-foreground">{item.testCode}</div>
      </TableCell>
      <TableCell>{formatTat(item.tatText)}</TableCell>
      <TableCell>
        <Badge variant={AVAILABILITY_BADGE_VARIANT[item.availability]}>
          {AVAILABILITY_LABELS[item.availability]}
        </Badge>
      </TableCell>
      <TableCell className="text-right font-medium">{formatCurrency(item.price)}</TableCell>
      <TableCell>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label={`Remove ${item.testName}`}
          onClick={() => onRemove(item.testId)}
        >
          <XIcon />
        </Button>
      </TableCell>
    </TableRow>
  );
}
