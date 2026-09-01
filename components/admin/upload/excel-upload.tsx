"use client";

import { useRef, useState } from "react";
import { UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { LocationSelector } from "@/components/layout/location-selector";
import { ServiceTypeSelector } from "@/components/layout/service-type-selector";
import type { Location } from "@/types/location";
import type { ServiceType } from "@/lib/constants/service-types";

// File picker + location/service-type selection for a price list Excel
// upload. Purely a form — the parent orchestrates the actual upload request.
export function ExcelUpload({
  locations,
  locationId,
  onLocationChange,
  serviceType,
  onServiceTypeChange,
  onSubmit,
  submitting,
}: {
  locations: Location[];
  locationId: string;
  onLocationChange: (id: string) => void;
  serviceType: ServiceType;
  onServiceTypeChange: (type: ServiceType) => void;
  onSubmit: (file: File) => void;
  submitting: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (file) onSubmit(file);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Location</Label>
          <LocationSelector locations={locations} value={locationId} onChange={onLocationChange} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Service type</Label>
          <ServiceTypeSelector value={serviceType} onChange={onServiceTypeChange} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="price-list-file">Price list file (.xlsx)</Label>
        <input
          ref={fileInputRef}
          id="price-list-file"
          type="file"
          accept=".xlsx"
          onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
          className="text-sm"
        />
      </div>

      <Button type="submit" disabled={!fileName || submitting} className="w-fit">
        <UploadIcon /> {submitting ? "Uploading…" : "Upload & validate"}
      </Button>
    </form>
  );
}
