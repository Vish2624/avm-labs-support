import "server-only";
import { createPriceListVersion } from "@/lib/database/imports";
import type { ServiceType } from "@/lib/constants/service-types";
import type { PriceListVersion } from "@/types/import";

/**
 * Creates a new price_list_versions row in 'staging' status for an uploaded
 * file — one row per upload attempt, even one that later fails validation,
 * so import history shows every attempt. The file itself isn't persisted to
 * storage; its content lives in price_list_staging_rows.raw_row once
 * validateImport() runs (see lib/imports/validate-import.ts).
 */
export async function createImport(input: {
  locationId: string;
  serviceType: ServiceType;
  originalFilename: string;
  fileSize: number;
  createdBy: string;
}): Promise<PriceListVersion> {
  return createPriceListVersion(input);
}
