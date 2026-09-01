"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Location } from "@/types/location";

// Dropdown to switch active location. Options are database-controlled
// (passed in as props from a server-fetched list), never hardcoded.
export function LocationSelector({
  locations,
  value,
  onChange,
}: {
  locations: Location[];
  value: string;
  onChange: (locationId: string) => void;
}) {
  return (
    <Select value={value} onValueChange={(next) => next && onChange(next)}>
      <SelectTrigger aria-label="Location">
        {/* Base UI's SelectValue renders the raw value unless given a
            formatter — it doesn't reflect the matching SelectItem's
            children like Radix does. */}
        <SelectValue placeholder="Select location">
          {(selectedId: string | null) => {
            const selected = locations.find((location) => location.id === selectedId);
            return selected ? `${selected.name} (${selected.code})` : "Select location";
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {locations.map((location) => (
          <SelectItem key={location.id} value={location.id}>
            {location.name} ({location.code})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
