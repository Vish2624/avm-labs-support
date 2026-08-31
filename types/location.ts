import type { LocationCode } from "@/lib/constants/locations";

/**
 * Mirrors the `locations` table. This is the source of truth for which
 * locations are active — never hardcode a location list in the UI.
 */
export interface Location {
  id: string;
  code: LocationCode;
  name: string;
  currency: string; // ISO 4217, e.g. "AED"
  active: boolean;
}
