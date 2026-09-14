"use client";

import { cn } from "@/lib/utils";
import {
  SERVICE_TYPE_FILTERS,
  SERVICE_TYPE_FILTER_LABELS,
  type ServiceTypeFilter,
} from "@/lib/constants/service-types";

// Same look as components/layout/service-type-selector.tsx, but with an
// "All" option — Workspace-search-only, since every other caller of that
// shared selector (Admin availability/export/upload, /profiles) needs a
// single real ServiceType, never "all".
export function ServiceTypeFilterSelector({
  value,
  onChange,
}: {
  value: ServiceTypeFilter;
  onChange: (serviceType: ServiceTypeFilter) => void;
}) {
  return (
    <div className="inline-flex items-center gap-[3px] rounded-[13px] bg-muted p-[3px]" role="group" aria-label="Service type">
      {SERVICE_TYPE_FILTERS.map((serviceType) => {
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
            {SERVICE_TYPE_FILTER_LABELS[serviceType]}
          </button>
        );
      })}
    </div>
  );
}
