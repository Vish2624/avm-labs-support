"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils/format-currency";
import { formatTat } from "@/lib/utils/format-tat";
import { getCurrencyFractionDigits } from "@/lib/pricing/money";
import { AVAILABILITY_LABELS, AVAILABILITY_STATUSES, type AvailabilityStatus } from "@/lib/constants/availability";
import { SERVICE_TYPES, SERVICE_TYPE_LABELS, type ServiceType } from "@/lib/constants/service-types";
import type { Location } from "@/types/location";
import type { ProfilePrice } from "@/types/profile";

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
export function ProfilePricingEditor({
  locations,
  prices,
  onSave,
  saving,
}: {
  locations: Location[];
  prices: ProfilePrice[];
  onSave: (values: ProfilePriceFormValues) => void;
  saving: boolean;
}) {
  const priceByKey = new Map(prices.map((price) => [`${price.locationId}:${price.serviceType}`, price]));
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [form, setForm] = useState({ price: "", tatText: "", availability: "available" as AvailabilityStatus });

  function startEdit(location: Location, serviceType: ServiceType) {
    const key = `${location.id}:${serviceType}`;
    const existing = priceByKey.get(key);
    const digits = getCurrencyFractionDigits(location.currencyCode);
    setForm({
      price: existing ? (existing.price / 10 ** digits).toFixed(digits) : "",
      tatText: existing?.tatText ?? "",
      availability: existing?.availability ?? "available",
    });
    setEditingKey(key);
  }

  function submit(locationId: string, serviceType: ServiceType) {
    const price = Number(form.price);
    if (!Number.isFinite(price) || price < 0 || !form.tatText.trim()) return;
    onSave({ locationId, serviceType, price, tatText: form.tatText.trim(), availability: form.availability });
    setEditingKey(null);
  }

  return (
    <div className="max-h-72 overflow-y-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Location</TableHead>
            <TableHead>Service type</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>TAT</TableHead>
            <TableHead>Availability</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {locations.flatMap((location) =>
            SERVICE_TYPES.map((serviceType) => {
              const key = `${location.id}:${serviceType}`;
              const existing = priceByKey.get(key);
              const isEditing = editingKey === key;

              if (isEditing) {
                return (
                  <TableRow key={key}>
                    <TableCell>{location.name}</TableCell>
                    <TableCell>{SERVICE_TYPE_LABELS[serviceType]}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={form.price}
                        onChange={(event) => setForm((prev) => ({ ...prev, price: event.target.value }))}
                        className="w-24"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={form.tatText}
                        onChange={(event) => setForm((prev) => ({ ...prev, tatText: event.target.value }))}
                        className="w-28"
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={form.availability}
                        onValueChange={(next) => next && setForm((prev) => ({ ...prev, availability: next as AvailabilityStatus }))}
                      >
                        <SelectTrigger>
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
                    </TableCell>
                    <TableCell className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setEditingKey(null)} disabled={saving}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={() => submit(location.id, serviceType)} disabled={saving}>
                        Save
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              }

              return (
                <TableRow key={key}>
                  <TableCell>{location.name}</TableCell>
                  <TableCell>{SERVICE_TYPE_LABELS[serviceType]}</TableCell>
                  <TableCell>{existing ? formatCurrency({ amount: existing.price, currency: existing.currencyCode }) : "—"}</TableCell>
                  <TableCell>{existing ? formatTat(existing.tatText) : "—"}</TableCell>
                  <TableCell>{existing ? AVAILABILITY_LABELS[existing.availability] : "—"}</TableCell>
                  <TableCell className="flex justify-end">
                    <Button size="sm" variant="outline" onClick={() => startEdit(location, serviceType)}>
                      {existing ? "Edit" : "Set price"}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
