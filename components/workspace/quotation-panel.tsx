"use client";

import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectedTests } from "./selected-tests";
import { WhatsappResponse } from "./whatsapp-response";
import { DiscountTiers } from "./discount-tiers";
import { formatCurrency } from "@/lib/utils/format-currency";
import { applyDiscount } from "@/lib/pricing/discount";
import { AVAILABILITY_LABELS } from "@/lib/constants/availability";
import { cn } from "@/lib/utils";
import type { Quotation } from "@/types/quotation";

// Totals, currency, and generated reply for the in-progress quotation.
// Package suggestions live in the "Find tests" column instead (see
// package-suggestions.tsx) — they're a search-time recommendation, not part
// of the quote itself.
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
  const { tier, discountAmount, discountedTotal } = applyDiscount(quotation.total);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Quotation</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {count > 0
              ? `${count} test${count === 1 ? "" : "s"}${context ? ` · ${context}` : ""}`
              : "Nothing added yet"}
          </p>
        </div>
        {count > 0 ? (
          <Button type="button" variant="outline" size="sm" onClick={onClear}>
            <Trash2Icon />
            Clear all
          </Button>
        ) : null}
      </div>

      {count > 0 ? (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2 border-b border-border pb-5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium text-muted-foreground">
                {tier ? "Subtotal" : "Total for the customer"}
              </span>
              <span
                className={cn(
                  "tabular-nums",
                  tier
                    ? "text-base font-medium text-muted-foreground line-through decoration-1"
                    : "text-2xl font-semibold tracking-tight text-primary"
                )}
              >
                {formatCurrency(quotation.total)}
              </span>
            </div>

            {tier ? (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-success-foreground">Discount ({tier.percent}%)</span>
                  <span className="text-base font-medium tabular-nums text-success-foreground">
                    -{formatCurrency(discountAmount)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-muted-foreground">Total after discount</span>
                  <span className="text-2xl font-semibold tracking-tight text-primary tabular-nums">
                    {formatCurrency(discountedTotal)}
                  </span>
                </div>
              </>
            ) : null}

            <DiscountTiers currency={quotation.total.currency} achievedPercent={tier?.percent} className="mt-1" />
          </div>

          {flagged.length > 0 ? (
            <p className="rounded-2xl bg-warning/15 px-4 py-3.5 text-[13.5px] leading-relaxed text-warning-foreground">
              Check before sending:{" "}
              {flagged.map((item) => `${item.testName} is ${AVAILABILITY_LABELS[item.availability].toLowerCase()}`).join(", ")}.
            </p>
          ) : null}

          <SelectedTests lineItems={quotation.lineItems} onRemove={onRemove} />

          <div className="flex flex-col gap-3 border-t border-border pt-5">
            <WhatsappResponse message={whatsappMessage} disabled={count === 0} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
