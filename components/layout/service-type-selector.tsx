"use client";

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
    <div className="inline-flex items-center gap-[3px] rounded-[13px] bg-muted p-[3px]" role="group" aria-label="Service type">
      {SERVICE_TYPES.map((serviceType) => {
        const active = value === serviceType;
        return (
          <button
            key={serviceType}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(serviceType)}
            className={cn(
              "rounded-[10px] px-3.5 py-2 text-[13.5px] font-medium transition-all",
              active ? "bg-card text-accent-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {SERVICE_TYPE_LABELS[serviceType]}
          </button>
        );
      })}
    </div>
  );
}
