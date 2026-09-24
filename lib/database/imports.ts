import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ImportStatus, PriceListVersion, PriceListStagingRow, ParsedPriceRow, ImportRowIssue } from "@/types/import";
import type { ServiceType } from "@/lib/constants/service-types";
import { invalidatesCatalog } from "@/lib/database/catalog-cache";

const VERSION_COLUMNS =
  "id, version_number, location_id, service_type, original_filename, file_storage_path, file_size, status, record_count, created_by, created_at, validated_at, approved_at, activated_at";

interface VersionRow {
  id: string;
  version_number: number;
  location_id: string;
  service_type: ServiceType;
  original_filename: string | null;
  file_storage_path: string | null;
  file_size: number | null;
  status: ImportStatus;
  record_count: number | null;
  created_by: string | null;
  created_at: string;
  validated_at: string | null;
  approved_at: string | null;
  activated_at: string | null;
}

function mapVersion(row: VersionRow): PriceListVersion {
  return {
    id: row.id,
    versionNumber: row.version_number,
    locationId: row.location_id,
    serviceType: row.service_type,
    originalFilename: row.original_filename ?? "",
    fileStoragePath: row.file_storage_path,
    fileSize: row.file_size,
    status: row.status,
    recordCount: row.record_count,
    createdBy: row.created_by ?? "",
    createdAt: row.created_at,
    validatedAt: row.validated_at,
    approvedAt: row.approved_at,
    activatedAt: row.activated_at,
  };
}

/**
 * Creates a new price_list_versions row in 'staging' status, auto-numbered
 * per (location, service_type). One row per upload attempt — even a file
 * that fails validation gets one, so import history shows every attempt.
 */
export async function createPriceListVersion(input: {
  locationId: string;
  serviceType: ServiceType;
  originalFilename: string;
  fileSize: number;
  createdBy: string;
}): Promise<PriceListVersion> {
  const supabase = createAdminClient();

  const { data: existing, error: maxError } = await supabase
    .from("price_list_versions")
    .select("version_number")
    .eq("location_id", input.locationId)
    .eq("service_type", input.serviceType)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxError) throw maxError;

  const versionNumber = (existing?.version_number ?? 0) + 1;

  const { data, error } = await supabase
    .from("price_list_versions")
    .insert({
      version_number: versionNumber,
      location_id: input.locationId,
      service_type: input.serviceType,
      original_filename: input.originalFilename,
      file_size: input.fileSize,
      status: "staging",
      created_by: input.createdBy,
    })
    .select(VERSION_COLUMNS)
    .single();
  if (error) throw error;

  return mapVersion(data as VersionRow);
}

export async function updatePriceListVersion(
  versionId: string,
  patch: Partial<{
    status: ImportStatus;
    recordCount: number;
    validatedAt: string;
    approvedAt: string;
    activatedAt: string;
  }>
): Promise<void> {
  const supabase = createAdminClient();
  const update: Record<string, unknown> = {};
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.recordCount !== undefined) update.record_count = patch.recordCount;
  if (patch.validatedAt !== undefined) update.validated_at = patch.validatedAt;
  if (patch.approvedAt !== undefined) update.approved_at = patch.approvedAt;
  if (patch.activatedAt !== undefined) update.activated_at = patch.activatedAt;

  const { error } = await supabase.from("price_list_versions").update(update).eq("id", versionId);
  if (error) throw error;
}

export async function getPriceListVersion(versionId: string): Promise<PriceListVersion | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("price_list_versions")
    .select(VERSION_COLUMNS)
    .eq("id", versionId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapVersion(data as VersionRow) : null;
}

/** Import history, newest first, optionally filtered by location/service type. */
export async function listPriceListVersions(filter?: {
  locationId?: string;
  serviceType?: ServiceType;
}): Promise<PriceListVersion[]> {
  const supabase = createAdminClient();
  let query = supabase.from("price_list_versions").select(VERSION_COLUMNS).order("created_at", { ascending: false });
  if (filter?.locationId) query = query.eq("location_id", filter.locationId);
  if (filter?.serviceType) query = query.eq("service_type", filter.serviceType);

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as VersionRow[]).map(mapVersion);
}

export async function getActivePriceListVersion(
  locationId: string,
  serviceType: ServiceType
): Promise<PriceListVersion | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("price_list_versions")
    .select(VERSION_COLUMNS)
    .eq("location_id", locationId)
    .eq("service_type", serviceType)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return data ? mapVersion(data as VersionRow) : null;
}

interface StagingRowRecord {
  id: string;
  version_id: string;
  row_number: number | null;
  raw_row: Record<string, unknown>;
  parsed: ParsedPriceRow | null;
  row_status: "ok" | "error" | "warning";
  error_messages: ImportRowIssue[] | null;
  created_at: string;
}

function mapStagingRow(row: StagingRowRecord): PriceListStagingRow {
  return {
    id: row.id,
    versionId: row.version_id,
    rowNumber: row.row_number,
    rawRow: row.raw_row,
    parsed: row.parsed,
    rowStatus: row.row_status,
    errorMessages: row.error_messages ?? [],
    createdAt: row.created_at,
  };
}

export async function insertStagingRows(
  versionId: string,
  rows: {
    rowNumber: number;
    rawRow: Record<string, unknown>;
    parsed: ParsedPriceRow | null;
    rowStatus: "ok" | "error" | "warning";
    errorMessages: ImportRowIssue[];
  }[]
): Promise<void> {
  if (rows.length === 0) return;

  const supabase = createAdminClient();
  const { error } = await supabase.from("price_list_staging_rows").insert(
    rows.map((row) => ({
      version_id: versionId,
      row_number: row.rowNumber,
      raw_row: row.rawRow,
      parsed: row.parsed,
      row_status: row.rowStatus,
      error_messages: row.errorMessages,
    }))
  );
  if (error) throw error;
}

export async function listStagingRows(versionId: string): Promise<PriceListStagingRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("price_list_staging_rows")
    .select("id, version_id, row_number, raw_row, parsed, row_status, error_messages, created_at")
    .eq("version_id", versionId)
    .order("row_number", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as StagingRowRecord[]).map(mapStagingRow);
}

/**
 * Transactionally activates a validated version: applies its staged rows as
 * the new current test_prices (creating any new tests), archives the
 * previously active version for the same (location, service_type), and
 * records an audit_log entry — all inside one Postgres function so a
 * failure rolls back everything (see the migration for the function body).
 */
async function activatePriceListVersionUncached(versionId: string, userId: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.rpc("activate_price_list_version", {
    p_version_id: versionId,
    p_user_id: userId,
  });
  if (error) throw error;
}

/**
 * Transactionally restores a prior (archived) version's prices as a brand
 * new active version — an append-only rollback, never rewriting history in
 * place (see the migration for the function body).
 */
async function rollbackToPriceListVersionUncached(
  targetVersionId: string,
  userId: string
): Promise<{ newVersionId: string }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("rollback_price_list_version", {
    p_target_version_id: targetVersionId,
    p_user_id: userId,
  });
  if (error) throw error;
  return { newVersionId: data as string };
}

// Writes drop the search catalog cache (lib/database/catalog-cache.ts) once they settle.
export const activatePriceListVersion = invalidatesCatalog(activatePriceListVersionUncached);
export const rollbackToPriceListVersion = invalidatesCatalog(rollbackToPriceListVersionUncached);
