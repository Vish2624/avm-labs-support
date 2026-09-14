"use client";

import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectedTests } from "./selected-tests";
import { WhatsappResponse } from "./whatsapp-response";
import { ProfileSuggestions } from "./profile-suggestions";
import { formatCurrency } from "@/lib/utils/format-currency";
import { AVAILABILITY_LABELS } from "@/lib/constants/availability";
import type { Quotation } from "@/types/quotation";
import type { ProfileSuggestion } from "@/types/profile";

// Totals, currency, package suggestions, and generated reply for the
// in-progress quotation.
export function QuotationPanel({
  quotation,
  whatsappMessage,
  context,
  profileSuggestions,
  profileSuggestionsLoading,
  onRemove,
  onClear,
}: {
  quotation: Quotation;
  whatsappMessage: string;
  context: string | null;
  profileSuggestions: ProfileSuggestion[];
  profileSuggestionsLoading: boolean;
  onRemove: (testId: string) => void;
  onClear: () => void;
}) {
  const count = quotation.lineItems.length;
  const flagged = quotation.lineItems.filter((item) => item.availability !== "available");

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
          <div className="flex items-baseline justify-between gap-3 border-b border-border pb-5">
            <span className="text-sm font-medium text-muted-foreground">Total for the customer</span>
            <span className="text-2xl font-semibold tracking-tight text-primary tabular-nums">
              {formatCurrency(quotation.total)}
            </span>
          </div>

          {flagged.length > 0 ? (
            <p className="rounded-2xl bg-warning/15 px-4 py-3.5 text-[13.5px] leading-relaxed text-warning-foreground">
              Check before sending:{" "}
              {flagged.map((item) => `${item.testName} is ${AVAILABILITY_LABELS[item.availability].toLowerCase()}`).join(", ")}.
            </p>
          ) : null}

          <SelectedTests lineItems={quotation.lineItems} onRemove={onRemove} />

          <ProfileSuggestions
            suggestions={profileSuggestions}
            loading={profileSuggestionsLoading}
            hasSelection={count > 0}
          />

          <div className="flex flex-col gap-3 border-t border-border pt-5">
            <WhatsappResponse message={whatsappMessage} disabled={count === 0} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
