"use client";

import { useEffect, useRef, useState } from "react";
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

// Floors (in px) for the two drag-resizable regions below the fixed header —
// price display and the WhatsApp reply — so neither can be dragged down to
// where its own content clips. The line-item list in between just takes
// whatever's left.
const PRICE_SECTION_MIN_PX = 88;
const REPLY_SECTION_MIN_PX = 150;
const LIST_SECTION_MIN_PX = 56;
const SPLIT_STORAGE_KEY = "avm-quotation-split";
const DEFAULT_SPLIT = { pricePercent: 30, replyPercent: 34 };

function readStoredSplit(): { pricePercent: number; replyPercent: number } {
  if (typeof window === "undefined") return DEFAULT_SPLIT;
  try {
    const raw = window.localStorage.getItem(SPLIT_STORAGE_KEY);
    if (!raw) return DEFAULT_SPLIT;
    const parsed = JSON.parse(raw);
    const { pricePercent, replyPercent } = parsed ?? {};
    if (typeof pricePercent === "number" && typeof replyPercent === "number") {
      return { pricePercent, replyPercent };
    }
  } catch {
    // Ignore malformed/legacy storage — fall back to the default split.
  }
  return DEFAULT_SPLIT;
}

// Totals, currency, and generated reply for the in-progress quotation.
// Package suggestions live in the "Find tests" column instead (see
// package-suggestions.tsx) — they're a search-time recommendation, not part
// of the quote itself.
//
// Layout: the title/count row is a fixed header; the price display, the
// line-item list, and the WhatsApp reply below it are three stacked regions
// an agent can resize by dragging the handles between them (persisted per
// browser), so whichever one matters most right now can take the room.
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

  const containerRef = useRef<HTMLDivElement>(null);
  const [{ pricePercent, replyPercent }, setSplit] = useState(readStoredSplit);
  const [dragging, setDragging] = useState<"price" | "reply" | null>(null);

  useEffect(() => {
    if (!dragging) return;

    function handlePointerMove(event: PointerEvent) {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();

      setSplit((prev) => {
        if (dragging === "price") {
          const minPercent = (PRICE_SECTION_MIN_PX / rect.height) * 100;
          const maxPercent = 100 - prev.replyPercent - (LIST_SECTION_MIN_PX / rect.height) * 100;
          const raw = ((event.clientY - rect.top) / rect.height) * 100;
          return { ...prev, pricePercent: Math.min(Math.max(raw, minPercent), Math.max(minPercent, maxPercent)) };
        }
        const minPercent = (REPLY_SECTION_MIN_PX / rect.height) * 100;
        const maxPercent = 100 - prev.pricePercent - (LIST_SECTION_MIN_PX / rect.height) * 100;
        const raw = ((rect.bottom - event.clientY) / rect.height) * 100;
        return { ...prev, replyPercent: Math.min(Math.max(raw, minPercent), Math.max(minPercent, maxPercent)) };
      });
    }
    function handlePointerUp() {
      setDragging(null);
    }

    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragging]);

  useEffect(() => {
    window.localStorage.setItem(SPLIT_STORAGE_KEY, JSON.stringify({ pricePercent, replyPercent }));
  }, [pricePercent, replyPercent]);

  return (
    <div ref={containerRef} className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-6 py-4 lg:px-7">
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
        <>
          {/* Price display — compact: subtotal/discount/total collapse to one
              line instead of three once a tier is reached. */}
          <div style={{ height: `${pricePercent}%` }} className="shrink-0 overflow-y-auto px-6 py-3 lg:px-7">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[13px] font-medium text-muted-foreground">
                    {tier ? "Total after discount" : "Total for the customer"}
                  </span>
                  {tier ? (
                    <span className="rounded-full bg-success/15 px-1.5 py-0.5 text-[10.5px] font-semibold text-success-foreground">
                      -{tier.percent}%
                    </span>
                  ) : null}
                </div>
                <div className="flex items-baseline gap-2">
                  {tier ? (
                    <span className="text-[13px] font-medium text-muted-foreground line-through decoration-1">
                      {formatCurrency(quotation.total)}
                    </span>
                  ) : null}
                  <span className="text-xl font-semibold tracking-tight text-primary tabular-nums">
                    {formatCurrency(tier ? discountedTotal : quotation.total)}
                  </span>
                </div>
              </div>
              {tier ? (
                <p className="text-right text-[11.5px] text-success-foreground/90">
                  You saved {formatCurrency(discountAmount)}
                </p>
              ) : null}

              <DiscountTiers currency={quotation.total.currency} achievedPercent={tier?.percent} className="mt-0.5" />

              {flagged.length > 0 ? (
                <p className="mt-1 rounded-xl bg-warning/15 px-3 py-2 text-[12.5px] leading-relaxed text-warning-foreground">
                  Check before sending:{" "}
                  {flagged
                    .map((item) => `${item.testName} is ${AVAILABILITY_LABELS[item.availability].toLowerCase()}`)
                    .join(", ")}
                  .
                </p>
              ) : null}
            </div>
          </div>

          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize price display"
            onPointerDown={(event) => {
              event.preventDefault();
              setDragging("price");
            }}
            onDoubleClick={() => setSplit((prev) => ({ ...prev, pricePercent: DEFAULT_SPLIT.pricePercent }))}
            className="group relative h-2.5 shrink-0 cursor-row-resize touch-none"
          >
            <div
              className={cn(
                "absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border transition-colors",
                "group-hover:bg-primary/50",
                dragging === "price" && "bg-primary"
              )}
            />
          </div>

          <div className="flex-1 overflow-y-auto px-6 lg:px-7">
            <SelectedTests lineItems={quotation.lineItems} onRemove={onRemove} />
          </div>

          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize WhatsApp reply"
            onPointerDown={(event) => {
              event.preventDefault();
              setDragging("reply");
            }}
            onDoubleClick={() => setSplit((prev) => ({ ...prev, replyPercent: DEFAULT_SPLIT.replyPercent }))}
            className="group relative h-2.5 shrink-0 cursor-row-resize touch-none"
          >
            <div
              className={cn(
                "absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border transition-colors",
                "group-hover:bg-primary/50",
                dragging === "reply" && "bg-primary"
              )}
            />
          </div>

          <div
            style={{ height: `${replyPercent}%` }}
            className="flex shrink-0 flex-col gap-3 overflow-y-auto border-t border-border px-6 pt-4 pb-5 lg:px-7 lg:pb-6"
          >
            <WhatsappResponse message={whatsappMessage} disabled={count === 0} />
          </div>
        </>
      ) : null}
    </div>
  );
}
