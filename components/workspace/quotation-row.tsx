"use client";

import { XIcon } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format-currency";
import { formatTat } from "@/lib/utils/format-tat";
import type { QuotationLineItem } from "@/types/quotation";

// One line item in the quotation (name, code, price, TAT, remove).
export function QuotationRow({
  item,
  onRemove,
}: {
  item: QuotationLineItem;
  onRemove: (testId: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border/60 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{item.testName}</div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {item.testCode} · ready in {formatTat(item.tatText)}
        </div>
      </div>
      <span className="shrink-0 text-sm font-semibold tabular-nums">{formatCurrency(item.price)}</span>
      <button
        type="button"
        aria-label={`Remove ${item.testName}`}
        onClick={() => onRemove(item.testId)}
        className="grid size-8 shrink-0 place-items-center rounded-[10px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
      >
        <XIcon className="size-[17px]" />
      </button>
    </div>
  );
}
