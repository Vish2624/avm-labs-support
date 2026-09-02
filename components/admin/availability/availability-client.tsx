"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { LocationSelector } from "@/components/layout/location-selector";
import { ServiceTypeSelector } from "@/components/layout/service-type-selector";
import { AvailabilityTable } from "./availability-table";
import { fetcher } from "@/lib/utils/fetcher";
import { SERVICE_TYPES, type ServiceType } from "@/lib/constants/service-types";
import type { AvailabilityStatus } from "@/lib/constants/availability";
import type { AvailabilityRow } from "@/lib/database/availability";
import type { Location } from "@/types/location";

export function AvailabilityClient({ locations }: { locations: Location[] }) {
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [serviceType, setServiceType] = useState<ServiceType>(SERVICE_TYPES[0]);

  const key = locationId
    ? `/api/admin/availability?${new URLSearchParams({ locationId, serviceType })}`
    : null;
  const { data, isLoading, mutate } = useSWR<{ rows: AvailabilityRow[] }>(key, fetcher);
  const rows = data?.rows ?? [];

  async function handleChange(row: AvailabilityRow, availability: AvailabilityStatus) {
    const previous = rows;
    await mutate({ rows: rows.map((r) => (r === row ? { ...r, availability } : r)) }, false);

    try {
      const response = await fetch("/api/admin/availability", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: row.kind, priceId: row.priceId, availability }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Could not update availability.");
      toast.success(`${row.label} updated.`);
    } catch (error) {
      toast.error((error as Error).message);
      await mutate({ rows: previous }, false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <LocationSelector locations={locations} value={locationId} onChange={setLocationId} />
        <ServiceTypeSelector value={serviceType} onChange={setServiceType} />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <AvailabilityTable rows={rows} onChange={handleChange} />
      )}
    </div>
  );
}
