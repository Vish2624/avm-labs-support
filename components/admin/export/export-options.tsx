"use client";

import { useState } from "react";
import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LocationSelector } from "@/components/layout/location-selector";
import { ServiceTypeSelector } from "@/components/layout/service-type-selector";
import { SERVICE_TYPES, type ServiceType } from "@/lib/constants/service-types";
import type { Location } from "@/types/location";

// Choose what to export — the test catalog, or one location + service
// type's current price list (same column schema the import pipeline
// reads, so it round-trips). Always built fresh from the database.
export function ExportOptions({ locations }: { locations: Location[] }) {
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [serviceType, setServiceType] = useState<ServiceType>(SERVICE_TYPES[0]);

  const priceListHref = locationId
    ? `/api/exports?${new URLSearchParams({ type: "prices", locationId, serviceType })}`
    : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-lg border p-3">
        <h3 className="text-sm font-medium">Test catalog</h3>
        <p className="text-sm text-muted-foreground">Every test in the master catalog, active or not.</p>
        <Button size="sm" className="w-fit" render={<a href="/api/exports?type=tests" />}>
          <DownloadIcon /> Download
        </Button>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border p-3">
        <h3 className="text-sm font-medium">Price list</h3>
        <p className="text-sm text-muted-foreground">
          Current prices for one location and service type — the same columns the Excel import reads.
        </p>
        <div className="flex items-center gap-2">
          <LocationSelector locations={locations} value={locationId} onChange={setLocationId} />
          <ServiceTypeSelector value={serviceType} onChange={setServiceType} />
        </div>
        <Button size="sm" className="w-fit" disabled={!priceListHref} render={priceListHref ? <a href={priceListHref} /> : undefined}>
          <DownloadIcon /> Download
        </Button>
      </div>
    </div>
  );
}
