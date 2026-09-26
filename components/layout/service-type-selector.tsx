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
    <div className="relative inline-grid grid-cols-2 rounded-xl bg-muted p-1" role="group" aria-label="Service type">
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-[9px] bg-card shadow-[0_1px_3px_rgb(0_0_0/0.08)] transition-transform duration-400 ease-[cubic-bezier(.34,1.3,.64,1)]",
          value === SERVICE_TYPES[1] && "translate-x-full"
        )}
      />
      {SERVICE_TYPES.map((serviceType) => {
        const active = value === serviceType;
        return (
          <button
            key={serviceType}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(serviceType)}
            className={cn(
              "relative h-[34px] rounded-[9px] px-3.5 text-[13.5px] font-medium whitespace-nowrap transition-colors duration-250",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {SERVICE_TYPE_LABELS[serviceType]}
          </button>
        );
      })}
    </div>
  );
}
