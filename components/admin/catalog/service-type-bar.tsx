"use client";

import { ArrowRightLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SERVICE_TYPES, SERVICE_TYPE_LABELS, type ServiceType } from "@/lib/constants/service-types";

/**
 * Which service type an item is, from its current prices: a test, component
 * or profile is In-House or Outsourced, never both. No prices yet counts as
 * In-House; "mixed" only happens with data from before this rule.
 */
export function itemServiceType(prices: { serviceType: ServiceType }[]): ServiceType | "mixed" {
  const types = new Set(prices.map((p) => p.serviceType));
  if (types.size === 0) return "in_house";
  return types.size === 1 ? [...types][0] : "mixed";
}

/** The service types whose price rows to show: just the item's own, or both while it's mixed. */
export function shownServiceTypes(current: ServiceType | "mixed"): readonly ServiceType[] {
  return current === "mixed" ? SERVICE_TYPES : [current];
}

// "In-House · Move to Outsourced" — one click moves every location's price
// (same amount and TAT) to the other type.
export function ServiceTypeBar({
  current,
  hasPrices,
  saving,
  onMove,
}: {
  current: ServiceType | "mixed";
  hasPrices: boolean;
  saving: boolean;
  onMove: (to: ServiceType) => void;
}) {
  if (current === "mixed") {
    return (
      <div className="rounded-xl bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
        This has both In-House and Outsourced prices. An item should be one or the other — remove the prices of the type
        it isn&apos;t.
      </div>
    );
  }
  const other: ServiceType = current === "in_house" ? "outsource" : "in_house";
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-muted/60 px-3 py-2.5">
      <span className="text-sm">
        Service type: <span className="font-semibold">{SERVICE_TYPE_LABELS[current]}</span>
      </span>
      {hasPrices ? (
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          disabled={saving}
          onClick={() => {
            if (confirm(`Move to ${SERVICE_TYPE_LABELS[other]}? Every location's price and TAT move with it.`)) onMove(other);
          }}
        >
          <ArrowRightLeftIcon /> Move to {SERVICE_TYPE_LABELS[other]}
        </Button>
      ) : (
        <span className="ml-auto text-xs text-muted-foreground">Set a price first; it can be moved to {SERVICE_TYPE_LABELS[other]} after.</span>
      )}
    </div>
  );
}
