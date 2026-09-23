"use client";

import { useState } from "react";
import { XIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/format-currency";
import { formatTat } from "@/lib/utils/format-tat";
import { applyDiscount, getDiscountTiers } from "@/lib/pricing/discount";
import { subtractMoney } from "@/lib/pricing/money";
import { AVAILABILITY_LABELS } from "@/lib/constants/availability";
import { SERVICE_TYPE_LABELS } from "@/lib/constants/service-types";
import { lineItemKey, type Quotation, type QuotationLineItem } from "@/types/quotation";

function lineMeta(item: QuotationLineItem): string {
  const availability = item.availability === "available" ? "" : ` · ${AVAILABILITY_LABELS[item.availability]}`;
  if (item.kind === "package") {
    return `${item.tests.length} test${item.tests.length === 1 ? "" : "s"} · ready in ${formatTat(item.tatText)}${availability}`;
  }
  return `${item.code} · ${SERVICE_TYPE_LABELS[item.serviceType]} · ready in ${formatTat(item.tatText)}${availability}`;
}

// Volume-discount progress: how far the total is towards the top tier, and
// what the next tier needs. Returns null for a currency with no tiers.
function tierProgress(quotation: Quotation) {
  const tiers = getDiscountTiers(quotation.total.currency);
  if (tiers.length === 0) return null;
  const top = tiers[tiers.length - 1];
  const next = tiers.find((tier) => quotation.total.amount < tier.thresholdMinor);
  return {
    percent: Math.min(100, (quotation.total.amount / top.thresholdMinor) * 100),
    hint: next
      ? `Add ${formatCurrency(subtractMoney({ amount: next.thresholdMinor, currency: quotation.total.currency }, quotation.total))} more to unlock ${next.percent}% off`
      : `Maximum ${top.percent}% volume discount applied`,
  };
}

// The in-progress quote: line items, total (with the volume discount), the
// generated WhatsApp reply and the Copy action. Copying also saves the
// quote to History (see onCopy) — once per distinct reply, so re-copying
// the same text doesn't create duplicates.
export function QuotationPanel({
  quotation,
  whatsappMessage,
  locationLabel,
  customerName,
  onCustomerNameChange,
  onRemove,
  onClear,
  onCopy,
}: {
  quotation: Quotation;
  whatsappMessage: string;
  locationLabel: string | null;
  customerName: string;
  onCustomerNameChange: (name: string) => void;
  onRemove: (item: QuotationLineItem) => void;
  onClear: () => void;
  /** Called after the reply lands on the clipboard; saves it to History. */
  onCopy: (message: string) => Promise<void>;
}) {
  const [copiedMessage, setCopiedMessage] = useState<string | null>(null);
  const count = quotation.lineItems.length;
  const copied = copiedMessage === whatsappMessage;

  const flagged = quotation.lineItems.filter((item) => item.availability !== "available");
  const { tier, discountedTotal } = applyDiscount(quotation.total);
  const progress = tierProgress(quotation);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(whatsappMessage);
    } catch {
      toast.error("Couldn't copy — select and copy the text manually.");
      return;
    }
    if (copied) {
      toast.success("Copied again");
      return;
    }
    setCopiedMessage(whatsappMessage);
    try {
      await onCopy(whatsappMessage);
      toast.success("Copied and saved to History");
    } catch {
      toast.warning("Copied, but couldn't save it to History.");
    }
  }

  const header = (
    <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-3.5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Quotation</h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          {count > 0 ? `${count} item${count === 1 ? "" : "s"}${locationLabel ? ` · ${locationLabel}` : ""}` : locationLabel}
        </p>
      </div>
      {count > 0 ? (
        <button
          type="button"
          onClick={onClear}
          className="h-[30px] rounded-lg px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          Clear all
        </button>
      ) : null}
    </div>
  );

  if (count === 0) {
    return (
      <div className="flex h-full flex-col">
        {header}
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-10 py-6 text-center">
          <div className="size-11 rounded-xl border-[1.5px] border-dashed border-input" />
          <p className="mt-1.5 text-[15px] font-medium">Nothing added yet</p>
          <p className="max-w-[320px] text-[13px] leading-relaxed text-muted-foreground">
            Search or paste the customer&apos;s message, then add tests. Price, discount and the reply update as
            you go.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {header}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="px-6">
          {quotation.lineItems.map((item) => (
            <div key={lineItemKey(item)} className="flex items-center gap-2.5 border-b border-border/60 py-[11px]">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{item.name}</span>
                  {item.kind === "package" ? (
                    <span className="shrink-0 rounded-[5px] bg-primary/10 px-1.5 py-px text-[10.5px] font-semibold text-primary">
                      PACKAGE
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">{lineMeta(item)}</div>
              </div>
              <span className="shrink-0 text-sm font-medium whitespace-nowrap tabular-nums">
                {formatCurrency(item.price)}
              </span>
              <button
                type="button"
                aria-label={`Remove ${item.name}`}
                onClick={() => onRemove(item)}
                className="grid size-[26px] shrink-0 place-items-center rounded-[7px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <XIcon className="size-4" />
              </button>
            </div>
          ))}
        </div>

        {flagged.length > 0 ? (
          <p className="mx-6 mt-3 rounded-[10px] bg-warning/20 px-3 py-2.5 text-[12.5px] leading-relaxed text-warning-foreground">
            Check before sending:{" "}
            {flagged.map((item) => `${item.name} is ${AVAILABILITY_LABELS[item.availability].toLowerCase()}`).join(", ")}.
          </p>
        ) : null}

        <div className="mx-6 mt-3 flex flex-col gap-2 rounded-xl bg-muted/60 px-3.5 py-2.5">
          <div className="flex items-center justify-between gap-2.5">
            <span className="text-[13px] font-medium">Total</span>
            <div className="flex items-baseline gap-2 tabular-nums">
              {tier ? (
                <>
                  <span className="rounded-full bg-success/15 px-1.5 py-px text-[11.5px] font-semibold text-success-foreground">
                    −{tier.percent}%
                  </span>
                  <span className="text-[12.5px] text-muted-foreground line-through">
                    {formatCurrency(quotation.total)}
                  </span>
                </>
              ) : null}
              <span className="text-[19px] font-semibold tracking-tight">
                {formatCurrency(tier ? discountedTotal : quotation.total)}
              </span>
            </div>
          </div>
          {progress ? (
            <div className="flex items-center gap-2.5">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-success transition-[width] duration-300"
                  style={{ width: `${progress.percent.toFixed(1)}%` }}
                />
              </div>
              <span className="text-[11.5px] whitespace-nowrap text-muted-foreground">{progress.hint}</span>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-2.5 px-6 pt-[18px] pb-2">
          <div className="flex items-center justify-between gap-2.5">
            <h2 className="text-sm font-semibold">Reply to send</h2>
            <input
              value={customerName}
              onChange={(event) => onCustomerNameChange(event.target.value)}
              placeholder="Customer name (optional)"
              aria-label="Customer name"
              className="h-[30px] w-[180px] rounded-lg border border-input bg-card px-2.5 text-[12.5px] outline-none focus:border-primary"
            />
          </div>
          <div className="rounded-[4px_14px_14px_14px] bg-bubble px-4 py-3.5 text-[13.5px] leading-relaxed whitespace-pre-wrap text-bubble-foreground">
            {whatsappMessage}
          </div>
        </div>
      </div>
      <div className="shrink-0 border-t border-border px-6 pt-3.5 pb-[18px]">
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            "h-[46px] w-full rounded-xl text-[14.5px] font-medium text-white transition-colors",
            copied ? "bg-success" : "bg-primary hover:bg-primary/90"
          )}
        >
          {copied ? "Copied — paste it into WhatsApp" : "Copy reply"}
        </button>
      </div>
    </div>
  );
}
