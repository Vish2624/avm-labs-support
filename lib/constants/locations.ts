/**
 * Type-level constant only. The authoritative list of active locations —
 * name, currency, timezone, active flag — lives in the `locations` table.
 * Never hardcode location records in application code; this exists purely
 * so code can type-check against the known location codes.
 */
export const LOCATION_CODES = ["DXB", "RUH", "KHJ", "BHR"] as const;

export type LocationCode = (typeof LOCATION_CODES)[number];

export function isLocationCode(value: string): value is LocationCode {
  return (LOCATION_CODES as readonly string[]).includes(value);
}
