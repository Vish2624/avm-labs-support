"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils/format-currency";
import { formatTat } from "@/lib/utils/format-tat";
import { getCurrencyFractionDigits } from "@/lib/pricing/money";
import { AVAILABILITY_LABELS, AVAILABILITY_STATUSES, type AvailabilityStatus } from "@/lib/constants/availability";
import { SERVICE_TYPES, SERVICE_TYPE_LABELS, type ServiceType } from "@/lib/constants/service-types";
import type { Location } from "@/types/location";
import type { ProfilePrice } from "@/types/profile";
import type { ProfileReference } from "@/types/catalog";
import { ServiceTypeBar, itemServiceType, shownServiceTypes } from "@/components/admin/catalog/service-type-bar";

export interface ProfilePriceFormValues {
  locationId: string;
  serviceType: ServiceType;
  price: number;
  tatText: string;
  availability: AvailabilityStatus;
}

// A profile's bundle price at every (location, service type) combination —
// a fixed price, never computed from component tests (spec). Direct
// admin-form editing, since profile pricing is admin-form-managed by
// design (assumption 5, AVM_PLAN.md), not part of the Excel pipeline.
// Each row shows its tests' summed price as a guide, and the slowest test's
// TAT — the profile's TAT, filled in for a new price.
export function ProfilePricingEditor({
  locations,
  prices,
  references = [],
  onSave,
  onRemove,
  onMove,
  saving,
}: {
  locations: Location[];
  prices: ProfilePrice[];
  references?: ProfileReference[];
  onSave: (values: ProfilePriceFormValues) => void;
  onRemove: (locationId: string, serviceType: ServiceType) => void;
  onMove: (to: ServiceType) => void;
  saving: boolean;
}) {
  const priceByKey = new Map(prices.map((price) => [`${price.locationId}:${price.serviceType}`, price]));
  // The guide comes from the tests' own prices, whatever their service type,
  // so an Outsourced profile of In-House tests still gets it.
  const referenceByKey = new Map<string, ProfileReference>();
  for (const ref of references) {
    for (const serviceType of SERVICE_TYPES) {
      const key = `${ref.locationId}:${serviceType}`;
      if (!referenceByKey.has(key) || ref.serviceType === serviceType) referenceByKey.set(key, ref);
    }
  }
  const current = itemServiceType(prices);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [form, setForm] = useState({ price: "", tatText: "", availability: "available" as AvailabilityStatus });

  function startEdit(location: Location, serviceType: ServiceType) {
    const key = `${location.id}:${serviceType}`;
    const existing = priceByKey.get(key);
    const digits = getCurrencyFractionDigits(location.currencyCode);
    setForm({
      price: existing ? (existing.price / 10 ** digits).toFixed(digits) : "",
      tatText: existing?.tatText ?? referenceByKey.get(key)?.slowestTat ?? "",
      availability: existing?.availability ?? "available",
    });
    setEditingKey(key);
  }

  function referenceNote(refKey: string, existing?: ProfilePrice) {
    const ref = referenceByKey.get(refKey);
    if (!ref) return null;
    const tatDiffers = existing && ref.slowestTat && existing.tatText !== ref.slowestTat;
    return (
      <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
        {ref.parts ? `Parts total (${ref.parts.join(" + ")})` : "Tests total"}{" "}
        {formatCurrency({ amount: ref.sum, currency: ref.currencyCode })}
        {ref.slowestTat ? ` · slowest TAT ${ref.slowestTat}` : ""}
        {ref.unpriced.length > 0 ? <span className="text-destructive"> · no price: {ref.unpriced.join(", ")}</span> : null}
        {tatDiffers ? <span className="text-destructive"> · TAT should be {ref.slowestTat}</span> : null}
      </div>
    );
  }

  function submit(locationId: string, serviceType: ServiceType) {
    const price = Number(form.price);
    if (!Number.isFinite(price) || price < 0 || !form.tatText.trim()) return;
    onSave({ locationId, serviceType, price, tatText: form.tatText.trim(), availability: form.availability });
    setEditingKey(null);
  }

  // One row per location: a wrapping flex row (not a table), so price, TAT,
  // availability and the buttons fold onto a second line instead of pushing
  // the dialog wider than the screen.
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <ServiceTypeBar current={current} hasPrices={prices.length > 0} saving={saving} onMove={onMove} />
      <div className="max-h-[60svh] overflow-x-hidden overflow-y-auto rounded-xl border border-border/60">
        {locations.flatMap((location) =>
          shownServiceTypes(current).map((serviceType) => {
            const locationLabel = current === "mixed" ? `${location.name} · ${SERVICE_TYPE_LABELS[serviceType]}` : location.name;
            const key = `${location.id}:${serviceType}`;
            const existing = priceByKey.get(key);

            if (editingKey === key) {
              return (
                <form
                  key={key}
                  onSubmit={(event) => {
                    event.preventDefault();
                    submit(location.id, serviceType);
                  }}
                  className="flex flex-col gap-2.5 border-b border-border/60 bg-muted/40 px-3.5 py-3 last:border-b-0"
                >
                  <div className="text-sm font-medium">{locationLabel}</div>
                  <div className="flex flex-wrap items-end gap-2.5">
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      Price ({location.currencyCode})
                      <Input
                        autoFocus
                        type="number"
                        min={0}
                        step="0.001"
                        value={form.price}
                        onChange={(event) => setForm((prev) => ({ ...prev, price: event.target.value }))}
                        className="w-28"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      TAT
                      <Input
                        value={form.tatText}
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
                  </div>
                  {referenceNote(key)}
                </form>
              );
            }

            return (
              <div key={key} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-border/60 px-3.5 py-3 text-sm last:border-b-0">
                <div className="w-20 shrink-0 font-medium">{locationLabel}</div>
                <div className="min-w-0 flex-1 basis-48">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="font-semibold tabular-nums">
                      {existing ? formatCurrency({ amount: existing.price, currency: existing.currencyCode }) : "Not offered"}
                    </span>
                    {existing ? <span className="text-muted-foreground">{formatTat(existing.tatText)}</span> : null}
                    {existing && existing.availability !== "available" ? (
                      <span className="text-xs text-muted-foreground">{AVAILABILITY_LABELS[existing.availability]}</span>
                    ) : null}
                  </div>
                  {referenceNote(key, existing)}
                </div>
                <div className="ml-auto flex shrink-0 gap-1.5">
                  {existing ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      disabled={saving}
                      onClick={() => {
                        if (confirm(`Stop offering this at ${location.name}?`)) onRemove(location.id, serviceType);
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
          })
        )}
      </div>
    </div>
  );
}
