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

/**
 * The Workspace search filter also offers "all" (both service types at
 * once, grouped in the results) alongside the two real service types.
 * "all" is a search-time filter only — every price row, line item, and
 * search result still belongs to exactly one real ServiceType.
 */
export const SERVICE_TYPE_FILTERS = ["all", ...SERVICE_TYPES] as const;

export type ServiceTypeFilter = (typeof SERVICE_TYPE_FILTERS)[number];

export const SERVICE_TYPE_FILTER_LABELS: Record<ServiceTypeFilter, string> = {
  all: "All",
  ...SERVICE_TYPE_LABELS,
};
