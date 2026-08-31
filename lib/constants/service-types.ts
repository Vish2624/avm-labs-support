/**
 * Central constant/type for service type, used everywhere instead of
 * inconsistent ad-hoc strings ("in-house", "In House", "internal", ...).
 */
export const SERVICE_TYPES = ["in_house", "outsource"] as const;

export type ServiceType = (typeof SERVICE_TYPES)[number];

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  in_house: "In-House",
  outsource: "Outsourced",
};

export function isServiceType(value: string): value is ServiceType {
  return (SERVICE_TYPES as readonly string[]).includes(value);
}
