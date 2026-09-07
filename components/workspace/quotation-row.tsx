"use client";

import { XIcon, FlaskConicalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils/format-currency";
import { formatTat } from "@/lib/utils/format-tat";
import { AVAILABILITY_LABELS, AVAILABILITY_BADGE_VARIANT } from "@/lib/constants/availability";
import type { QuotationLineItem } from "@/types/quotation";

// One line item in the quotation (name, code, price, TAT, availability, remove).
export function QuotationRow({
  item,
  onRemove,
}: {
  item: QuotationLineItem;
  onRemove: (testId: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
        <FlaskConicalIcon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{item.testName}</span>
          <Badge variant="outline">{item.testCode}</Badge>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>TAT: {formatTat(item.tatText)}</span>
          <Badge variant={AVAILABILITY_BADGE_VARIANT[item.availability]}>
            {AVAILABILITY_LABELS[item.availability]}
          </Badge>
        </div>
      </div>
      <span className="shrink-0 font-semibold tabular-nums">{formatCurrency(item.price)}</span>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={`Remove ${item.testName}`}
        onClick={() => onRemove(item.testId)}
      >
        <XIcon />
      </Button>
    </div>
  );
}
