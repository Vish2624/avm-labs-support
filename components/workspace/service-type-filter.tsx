"use client";

import { cn } from "@/lib/utils";
import {
  SERVICE_TYPE_FILTERS,
  SERVICE_TYPE_FILTER_LABELS,
  type ServiceTypeFilter,
} from "@/lib/constants/service-types";

// Pill filter with an "All" option — Workspace-search-only, since every
// other caller of components/layout/service-type-selector.tsx (Admin
// availability/export/upload, /profiles) needs a single real ServiceType,
// never "all".
export function ServiceTypeFilterSelector({
  value,
  onChange,
}: {
  value: ServiceTypeFilter;
  onChange: (serviceType: ServiceTypeFilter) => void;
}) {
  return (
    <div className="flex gap-1.5" role="group" aria-label="Service type">
      {SERVICE_TYPE_FILTERS.map((serviceType) => {
        const active = value === serviceType;
        return (
          <button
            key={serviceType}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(serviceType)}
            className={cn(
              "h-[34px] rounded-full border px-[13px] text-[13.5px] font-medium whitespace-nowrap transition-all duration-250",
              active
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-foreground hover:border-primary"
            )}
          >
            {SERVICE_TYPE_FILTER_LABELS[serviceType]}
          </button>
        );
      })}
    </div>
  );
}
