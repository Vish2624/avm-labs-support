import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AuditLogEntry } from "@/types/import";

interface AuditLogRow {
  id: string;
  user_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  old_value: unknown;
  new_value: unknown;
  created_at: string;
}

function mapAuditLog(row: AuditLogRow): AuditLogEntry {
  return {
    id: row.id,
    userId: row.user_id,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id,
    oldValue: row.old_value,
    newValue: row.new_value,
    createdAt: row.created_at,
  };
}

/**
 * Records one admin action for the audit trail — every create/update/
 * deactivate across tests/aliases/profiles/availability, plus exports, logs
 * here. Best-effort: a logging failure never blocks the action itself, so
 * callers fire-and-forget this rather than awaiting it inline with the
 * mutation's own error handling.
 */
export async function recordAuditLog(entry: {
  userId: string;
  action: string;
  entity: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
}): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("audit_log").insert({
    user_id: entry.userId,
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entityId ?? null,
    old_value: entry.oldValue ?? null,
    new_value: entry.newValue ?? null,
  });
  if (error) throw error;
}

export async function listAuditLogEntries(filter?: {
  action?: string;
  entity?: string;
  limit?: number;
}): Promise<AuditLogEntry[]> {
  const supabase = createAdminClient();
  let query = supabase
    .from("audit_log")
    .select("id, user_id, action, entity, entity_id, old_value, new_value, created_at")
    .order("created_at", { ascending: false })
    .limit(filter?.limit ?? 50);

  if (filter?.action) query = query.eq("action", filter.action);
  if (filter?.entity) query = query.eq("entity", filter.entity);

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as AuditLogRow[]).map(mapAuditLog);
}
