import type { ServiceType } from "@/lib/constants/service-types";

/**
 * Lifecycle of one price_list_versions row. Only ONE version per
 * (location, service_type) may be "active" at a time. A failed validation
 * never reaches "active" — the previously active version is untouched.
 */
export const IMPORT_STATUSES = [
  "staging",
  "validated",
  "approved",
  "active",
  "archived",
  "failed",
  "rolled_back",
] as const;

export type ImportStatus = (typeof IMPORT_STATUSES)[number];

/** Mirrors `price_list_versions`. */
export interface PriceListVersion {
  id: string;
  versionNumber: number;
  locationId: string;
  serviceType: ServiceType;
  originalFilename: string;
  status: ImportStatus;
  createdBy: string;
  createdAt: string;
  activatedAt: string | null;
}

export type ImportRowSeverity = "error" | "warning";

export interface ImportRowIssue {
  row: number;
  field: string;
  severity: ImportRowSeverity;
  message: string;
}

export interface ImportValidationReport {
  versionId: string;
  rowCount: number;
  errorCount: number;
  warningCount: number;
  issues: ImportRowIssue[];
}
