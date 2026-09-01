import type { ServiceType } from "@/lib/constants/service-types";
import type { AvailabilityStatus } from "@/lib/constants/availability";

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
  fileStoragePath: string | null;
  fileSize: number | null;
  status: ImportStatus;
  recordCount: number | null;
  createdBy: string;
  createdAt: string;
  validatedAt: string | null;
  approvedAt: string | null;
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

/** One successfully validated row, ready to stage (price already converted to minor units). */
export interface ParsedPriceRow {
  rowNumber: number;
  testCode: string;
  testName: string;
  category: string | null;
  price: number; // minor units, see lib/pricing/money.ts
  tatText: string;
  availability: AvailabilityStatus;
  notes: string | null;
  /** True if testCode doesn't exist in the catalog yet — created on activation. */
  isNewTest: boolean;
}

/** Mirrors `price_list_staging_rows`. */
export interface PriceListStagingRow {
  id: string;
  versionId: string;
  rowNumber: number | null;
  rawRow: Record<string, unknown>;
  parsed: ParsedPriceRow | null;
  rowStatus: "ok" | "error" | "warning";
  errorMessages: ImportRowIssue[];
  createdAt: string;
}

export type ImportDiffRowStatus = "new_test" | "new_price" | "changed" | "unchanged";

interface ImportDiffSnapshot {
  price: number; // minor units
  currencyCode: string;
  tatText: string;
  availability: AvailabilityStatus;
}

/** One row's before/after, for the activation preview screen. */
export interface ImportDiffRow {
  testCode: string;
  testName: string;
  status: ImportDiffRowStatus;
  previous: ImportDiffSnapshot | null;
  next: ImportDiffSnapshot;
  /** Percent change vs. previous.price, rounded; null when there's no previous price to compare against. */
  priceChangePercent: number | null;
}

export interface ImportDiff {
  newTestCount: number;
  newPriceCount: number;
  changedCount: number;
  unchangedCount: number;
  rows: ImportDiffRow[];
}

/** Mirrors `audit_log`. */
export interface AuditLogEntry {
  id: string;
  userId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  oldValue: unknown;
  newValue: unknown;
  createdAt: string;
}
