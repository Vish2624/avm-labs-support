"use client";

import { useEffect, useRef, useState } from "react";
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

/**
 * Eases a displayed number towards `target` over ~0.55s, so the total
 * counts up/down as tests are added. Display only — always settles on the
 * exact integer amount, and jumps straight there for reduced motion.
 */
function useCountUp(target: number): number {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);

  useEffect(() => {
    const from = shownRef.current;
    if (from === target) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const progress = reduced ? 1 : Math.min(1, (now - start) / 550);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = progress >= 1 ? target : Math.round(from + (target - from) * eased);
      shownRef.current = value;
      setShown(value);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return shown;
}

/** Length of a line's slide-out (matches avm-item-out in globals.css). */
const EXIT_MS = 260;

// The in-progress quote: line items, total (with the volume discount), the
// generated WhatsApp reply and the Copy action.
export function QuotationPanel({
  quotation,
  whatsappMessage,
  locationLabel,
  customerName,
  onCustomerNameChange,
  onRemove,
  onClear,
}: {
  quotation: Quotation;
  whatsappMessage: string;
  locationLabel: string | null;
  customerName: string;
  onCustomerNameChange: (name: string) => void;
  onRemove: (item: QuotationLineItem) => void;
  onClear: () => void;
}) {
  const [copiedMessage, setCopiedMessage] = useState<string | null>(null);
  // Lines playing their slide-out before they're actually removed.
  const [leaving, setLeaving] = useState<Set<string>>(() => new Set());

  function removeWithExit(item: QuotationLineItem) {
    const key = lineItemKey(item);
    setLeaving((prev) => new Set(prev).add(key));
    setTimeout(() => {
      onRemove(item);
      setLeaving((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }, EXIT_MS);
  }

  function clearWithExit() {
    setLeaving(new Set(quotation.lineItems.map(lineItemKey)));
    setTimeout(() => {
      onClear();
      setLeaving(new Set());
    }, EXIT_MS);
  }
  const count = quotation.lineItems.length;
  const copied = copiedMessage === whatsappMessage;

  const flagged = quotation.lineItems.filter((item) => item.availability !== "available");
  const { tier, discountedTotal } = applyDiscount(quotation.total);
  const progress = tierProgress(quotation);
  const finalTotal = tier ? discountedTotal : quotation.total;
  const shownTotal = useCountUp(finalTotal.amount);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(whatsappMessage);
    } catch {
      toast.error("Couldn't copy — select and copy the text manually.");
      return;
    }
    setCopiedMessage(whatsappMessage);
    toast.success("Copied to clipboard");
  }

  const header = (
    <div className="flex items-start justify-between gap-3 px-7 pt-6 pb-3.5">
      <div>
        <h1 className="text-[19px] font-semibold tracking-[-0.01em]">Quotation</h1>
        <p className="mt-1 text-[13.5px] text-muted-foreground">
          {count > 0 ? `${count} item${count === 1 ? "" : "s"}${locationLabel ? ` · ${locationLabel}` : ""}` : locationLabel}
        </p>
      </div>
      {count > 0 ? (
        <button
          type="button"
          onClick={clearWithExit}
          className="h-[30px] rounded-lg px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive avm-check"
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
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-10 py-6 text-center avm-fade-up">
          <div className="grid size-[52px] place-items-center rounded-[14px] border-[1.5px] border-dashed border-input">
            <span className="size-3.5 rounded bg-primary/15" style={{ animation: "avm-drift-sm 5s ease-in-out infinite" }} />
          </div>
          <p className="mt-2 text-base font-medium">Nothing added yet</p>
          <p className="max-w-[320px] text-[13.5px] leading-relaxed text-pretty text-muted-foreground">
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
        <div className="px-7">
          {quotation.lineItems.map((item) => (
            <div
              key={lineItemKey(item)}
              className={cn(
                "flex items-center gap-2.5 border-b border-border py-3",
                leaving.has(lineItemKey(item)) ? "pointer-events-none avm-item-out" : "avm-item-in"
              )}
              style={{ animationDelay: leaving.has(lineItemKey(item)) ? "0ms" : undefined }}
            >
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
                onClick={() => removeWithExit(item)}
                className="grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground transition-[background,color,transform,translate,scale,rotate] duration-200 hover:rotate-90 hover:bg-destructive/10 hover:text-destructive"
              >
                <XIcon className="size-4" />
              </button>
            </div>
          ))}
        </div>

        {flagged.length > 0 ? (
          <p className="mx-7 mt-3.5 rounded-[11px] bg-warning/20 px-3 py-2.5 text-[12.5px] leading-relaxed text-warning-foreground avm-fade-up">
            Check before sending:{" "}
            {flagged.map((item) => `${item.name} is ${AVAILABILITY_LABELS[item.availability].toLowerCase()}`).join(", ")}.
          </p>
        ) : null}

        <div className="mx-7 mt-3.5 flex flex-col gap-2.5 rounded-[14px] bg-muted/70 px-4 py-3.5">
          <div className="flex items-center justify-between gap-2.5">
            <span className="text-[13.5px] font-medium">Total</span>
            <div className="flex items-baseline gap-2 tabular-nums">
              {tier ? (
                <>
                  <span className="rounded-full bg-success/15 px-[7px] py-px text-[11.5px] font-semibold text-success-foreground avm-check">
                    −{tier.percent}%
                  </span>
                  <span className="text-[12.5px] text-muted-foreground line-through">
                    {formatCurrency(quotation.total)}
                  </span>
                </>
              ) : null}
              <span className="text-[21px] font-semibold tracking-[-0.01em]">
                {formatCurrency({ amount: shownTotal, currency: finalTotal.currency })}
              </span>
            </div>
          </div>
          {progress ? (
            <div className="flex items-center gap-2.5">
              <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-success transition-[width] duration-600 ease-[cubic-bezier(.2,.8,.2,1)]"
                  style={{ width: `${progress.percent.toFixed(1)}%` }}
                />
              </div>
              <span className="text-[11.5px] whitespace-nowrap text-muted-foreground">{progress.hint}</span>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-2.5 px-7 pt-5 pb-2.5">
          <div className="flex items-center justify-between gap-2.5">
            <h2 className="text-sm font-semibold">Reply to send</h2>
            <input
              value={customerName}
              onChange={(event) => onCustomerNameChange(event.target.value)}
              placeholder="Customer name (optional)"
              aria-label="Customer name"
              className="h-8 w-[190px] rounded-[9px] border border-input bg-card px-2.5 text-[12.5px] outline-none transition-[border-color,box-shadow] duration-200 focus:border-primary focus:ring-[3px] focus:ring-primary/15"
            />
          </div>
          <div className="rounded-[4px_16px_16px_16px] bg-bubble px-4 py-3.5 transition-colors duration-300 dark:ring-1 dark:ring-success/20 text-[13.5px] leading-relaxed whitespace-pre-wrap text-bubble-foreground">
            {whatsappMessage}
          </div>
        </div>
      </div>
      <div className="shrink-0 border-t border-border px-7 pt-3.5 pb-5">
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            "h-12 w-full rounded-[13px] text-[14.5px] font-medium text-white transition-[background,transform,translate,scale,rotate,box-shadow] duration-250 hover:-translate-y-px hover:shadow-[0_10px_24px_-12px_var(--primary)] active:scale-[0.985]",
            copied ? "bg-success" : "bg-primary"
          )}
        >
          {copied ? (
            <span key="copied" className="inline-flex items-center gap-2 avm-check">
              ✓ Copied — paste it into WhatsApp
            </span>
          ) : (
            "Copy reply"
          )}
        </button>
      </div>
    </div>
  );
}
