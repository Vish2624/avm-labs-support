import type { LocationCode } from "@/lib/constants/locations";

/**
 * Mirrors the `locations` table. This is the source of truth for which
 * locations are active — never hardcode a location list in the UI.
 */
export interface Location {
  id: string;
  code: LocationCode;
  name: string;
  country: string;
  currencyCode: string; // ISO 4217, e.g. "AED"
  currencySymbol: string; // display symbol, e.g. "AED", "SAR", ".د.ب"
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
