/**
 * Central constant/type for test/profile availability status.
 */
export const AVAILABILITY_STATUSES = ["available", "unavailable", "temporarily_unavailable"] as const;

export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];

export const AVAILABILITY_LABELS: Record<AvailabilityStatus, string> = {
  available: "Available",
  unavailable: "Unavailable",
  temporarily_unavailable: "Temporarily Unavailable",
};

/** Badge variant for each status — shared by the workspace result card and quotation row. */
export const AVAILABILITY_BADGE_VARIANT: Record<
  AvailabilityStatus,
  "secondary" | "destructive" | "outline"
> = {
  available: "secondary",
  unavailable: "destructive",
  temporarily_unavailable: "outline",
};

export function isAvailabilityStatus(value: string): value is AvailabilityStatus {
  return (AVAILABILITY_STATUSES as readonly string[]).includes(value);
}
