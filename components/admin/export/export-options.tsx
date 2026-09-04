"use client";

import { useState } from "react";
import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
      <Card>
        <CardHeader>
          <CardTitle>Test catalog</CardTitle>
          <CardDescription>Every test in the master catalog, active or not.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button size="sm" className="w-fit" nativeButton={false} render={<a href="/api/exports?type=tests" />}>
            <DownloadIcon /> Download
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Price list</CardTitle>
          <CardDescription>
            Current prices for one location and service type — the same columns the Excel import reads.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <LocationSelector locations={locations} value={locationId} onChange={setLocationId} />
            <ServiceTypeSelector value={serviceType} onChange={setServiceType} />
          </div>
          <Button
            size="sm"
            className="w-fit"
            disabled={!priceListHref}
            nativeButton={false}
            render={priceListHref ? <a href={priceListHref} /> : undefined}
          >
            <DownloadIcon /> Download
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
