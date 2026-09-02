"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SERVICE_TYPES, SERVICE_TYPE_LABELS, type ServiceType } from "@/lib/constants/service-types";

// Toggle between in_house / outsource views.
export function ServiceTypeSelector({
  value,
  onChange,
}: {
  value: ServiceType;
  onChange: (serviceType: ServiceType) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-input bg-muted/40 p-0.5 backdrop-blur-sm" role="group" aria-label="Service type">
      {SERVICE_TYPES.map((serviceType) => (
        <Button
          key={serviceType}
          type="button"
          size="sm"
          variant={value === serviceType ? "default" : "ghost"}
          className={cn("h-7")}
          aria-pressed={value === serviceType}
          onClick={() => onChange(serviceType)}
        >
          {SERVICE_TYPE_LABELS[serviceType]}
        </Button>
      ))}
    </div>
  );
}
