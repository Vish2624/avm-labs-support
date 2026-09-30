"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils/format-currency";
import { getCurrencyFractionDigits } from "@/lib/pricing/money";
import { AVAILABILITY_LABELS, AVAILABILITY_STATUSES, type AvailabilityStatus } from "@/lib/constants/availability";
import { SERVICE_TYPE_LABELS, type ServiceType } from "@/lib/constants/service-types";
import { ServiceTypeBar, itemServiceType, shownServiceTypes } from "./service-type-bar";
import type { Location } from "@/types/location";
import type { CatalogPrice } from "@/types/catalog";

export interface PriceEdit {
  locationId: string;
  serviceType: ServiceType;
  price: number;
  tatText: string;
  availability: AvailabilityStatus;
}

/** Common TATs offered as one-click picks (any text can still be typed). */
const TAT_PRESETS = ["4 hrs", "24 hrs", "48 hrs", "72 hrs"];

// A test's or component's price at every location, each row edited in
// place — for its own service type only (In-House or Outsourced, moved with
// the bar above). Saving a row goes through the versioned price import, so
// it's in Updates like any upload.
export function PriceGrid({
  locations,
  prices,
  saving,
  onSave,
  onRemove,
  onMove,
}: {
  locations: Location[];
  prices: CatalogPrice[];
  saving: boolean;
  onSave: (edit: PriceEdit) => Promise<boolean>;
  onRemove: (locationId: string, serviceType: ServiceType) => Promise<boolean>;
  onMove: (to: ServiceType) => void;
}) {
  const current = itemServiceType(prices);
  const priceByKey = new Map(prices.map((p) => [`${p.locationId}|${p.serviceType}`, p]));
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [form, setForm] = useState({ price: "", tatText: "", availability: "available" as AvailabilityStatus });

  function startEdit(location: Location, serviceType: ServiceType) {
    const existing = priceByKey.get(`${location.id}|${serviceType}`);
    const digits = getCurrencyFractionDigits(location.currencyCode);
    // A new price starts with the TAT another location already uses for this service type.
    const siblingTat = prices.find((p) => p.serviceType === serviceType)?.tatText ?? "";
    setForm({
      price: existing ? (existing.price / 10 ** digits).toFixed(digits) : "",
      tatText: existing?.tatText ?? siblingTat,
      availability: existing?.availability ?? "available",
    });
    setEditingKey(`${location.id}|${serviceType}`);
  }

  async function submit(location: Location, serviceType: ServiceType) {
    const price = Number(form.price);
    if (form.price.trim() === "" || !Number.isFinite(price) || price < 0) return;
    if (!form.tatText.trim()) return;
    const ok = await onSave({ locationId: location.id, serviceType, price, tatText: form.tatText.trim(), availability: form.availability });
    if (ok) setEditingKey(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <ServiceTypeBar current={current} hasPrices={prices.length > 0} saving={saving} onMove={onMove} />
      {shownServiceTypes(current).map((serviceType) => (
        <div key={serviceType} className="flex flex-col gap-1.5">
          {current === "mixed" ? (
            <p className="text-xs font-semibold tracking-[0.05em] text-muted-foreground uppercase">{SERVICE_TYPE_LABELS[serviceType]}</p>
          ) : null}
          <div className="overflow-hidden rounded-xl border border-border/60">
            {locations.map((location) => {
              const key = `${location.id}|${serviceType}`;
              const existing = priceByKey.get(key);
              const digits = getCurrencyFractionDigits(location.currencyCode);

              if (editingKey === key) {
                return (
                  <form
                    key={key}
                    onSubmit={(event) => {
                      event.preventDefault();
                      void submit(location, serviceType);
                    }}
                    className="flex flex-wrap items-end gap-2.5 border-b border-border/60 bg-muted/40 px-3 py-3 last:border-b-0"
                  >
                    <div className="w-24 text-sm font-medium">{location.name}</div>
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      Price ({location.currencyCode})
                      <Input
                        autoFocus
                        inputMode="decimal"
                        value={form.price}
                        placeholder={(0).toFixed(digits)}
                        onChange={(event) => setForm((prev) => ({ ...prev, price: event.target.value }))}
                        className="w-28"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      TAT
                      <Input
                        value={form.tatText}
                        list="tat-presets"
                        placeholder="e.g. 4 hrs"
                        onChange={(event) => setForm((prev) => ({ ...prev, tatText: event.target.value }))}
                        className="w-28"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      Availability
                      <Select
                        value={form.availability}
                        onValueChange={(next) => next && setForm((prev) => ({ ...prev, availability: next as AvailabilityStatus }))}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue>{(value: string) => AVAILABILITY_LABELS[value as AvailabilityStatus]}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {AVAILABILITY_STATUSES.map((status) => (
                            <SelectItem key={status} value={status}>
                              {AVAILABILITY_LABELS[status]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                    <div className="ml-auto flex gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => setEditingKey(null)} disabled={saving}>
                        Cancel
                      </Button>
                      <Button type="submit" size="sm" disabled={saving}>
                        {saving ? "Saving…" : "Save"}
                      </Button>
                    </div>
                  </form>
                );
              }

              return (
                <div
                  key={key}
                  className="flex items-center gap-3 border-b border-border/60 px-3 py-2.5 text-sm last:border-b-0"
                >
                  <div className="w-24 font-medium">{location.name}</div>
                  {existing ? (
                    <>
                      <div className="w-28 font-semibold tabular-nums">
                        {formatCurrency({ amount: existing.price, currency: existing.currencyCode })}
                      </div>
                      <div className="w-20 text-muted-foreground">{existing.tatText}</div>
                      <div className="text-xs text-muted-foreground">
                        {existing.availability === "available" ? "" : AVAILABILITY_LABELS[existing.availability]}
                      </div>
                    </>
                  ) : (
                    <div className="text-muted-foreground">Not offered</div>
                  )}
                  <div className="ml-auto flex gap-1.5">
                    {existing ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive"
                        disabled={saving}
                        onClick={() => {
                          if (confirm(`Stop offering this at ${location.name} (${SERVICE_TYPE_LABELS[serviceType]})?`)) {
                            void onRemove(location.id, serviceType);
                          }
                        }}
                      >
                        Remove
                      </Button>
                    ) : null}
                    <Button size="sm" variant="outline" onClick={() => startEdit(location, serviceType)} disabled={saving}>
                      {existing ? "Edit" : "Set price"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <datalist id="tat-presets">
        {TAT_PRESETS.map((tat) => (
          <option key={tat} value={tat} />
        ))}
      </datalist>
    </div>
  );
}
