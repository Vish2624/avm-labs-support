import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { SERVICE_TYPE_LABELS, type ServiceType } from "@/lib/constants/service-types";
import { AVAILABILITY_LABELS, type AvailabilityStatus } from "@/lib/constants/availability";

/**
 * The /updates feed: a chronological, agent-facing log of changes that
 * affect what agents quote — price-list activations (from
 * price_list_versions) and one-off availability/profile-price corrections
 * (from audit_log). Read-only; no new table, just a merge of two existing
 * ones sorted newest-first.
 */

export type UpdateKind =
  | "price_list_activated"
  | "availability_changed"
  | "profile_price_changed"
  | "test_added";

export interface UpdateEntry {
  id: string;
  at: string;
  kind: UpdateKind;
  title: string;
  detail: string | null;
}

const AUDIT_ACTIONS = ["set_availability", "set_profile_price", "create_test"] as const;

interface VersionFeedRow {
  id: string;
  version_number: number;
  service_type: ServiceType;
  record_count: number | null;
  original_filename: string | null;
  activated_at: string;
  locations: { name: string } | { name: string }[] | null;
}

interface AuditFeedRow {
  id: string;
  action: string;
  entity: string;
  entity_id: string | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export async function listRecentUpdates(limit = 40): Promise<UpdateEntry[]> {
  const supabase = createAdminClient();

  const [versionsResult, auditResult] = await Promise.all([
    supabase
      .from("price_list_versions")
      .select("id, version_number, service_type, record_count, original_filename, activated_at, locations(name)")
      .not("activated_at", "is", null)
      .order("activated_at", { ascending: false })
      .limit(limit),
    supabase
      .from("audit_log")
      .select("id, action, entity, entity_id, new_value, created_at")
      .in("action", AUDIT_ACTIONS as unknown as string[])
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  if (versionsResult.error) throw versionsResult.error;
  if (auditResult.error) throw auditResult.error;

  const entries: UpdateEntry[] = [];

  for (const row of (versionsResult.data ?? []) as VersionFeedRow[]) {
    const locationName = one(row.locations)?.name ?? "Unknown location";
    const count = row.record_count ?? 0;
    entries.push({
      id: `version:${row.id}`,
      at: row.activated_at,
      kind: "price_list_activated",
      title: `${locationName} · ${SERVICE_TYPE_LABELS[row.service_type]} price list updated (v${row.version_number})`,
      detail: `${count} test${count === 1 ? "" : "s"} priced${row.original_filename ? ` · ${row.original_filename}` : ""}`,
    });
  }

  // Resolve names for the availability entries in one batch per entity kind,
  // so the feed stays informative without an N+1 lookup.
  const audits = (auditResult.data ?? []) as AuditFeedRow[];
  const testPriceIds = audits.filter((a) => a.action === "set_availability" && a.entity === "test_prices" && a.entity_id).map((a) => a.entity_id!);
  const profilePriceIds = audits.filter((a) => a.entity === "profile_prices" && a.entity_id).map((a) => a.entity_id!);

  const [testLabels, profileLabels] = await Promise.all([
    labelsForTestPrices(supabase, testPriceIds),
    labelsForProfilePrices(supabase, profilePriceIds),
  ]);

  for (const row of audits) {
    const nv = row.new_value ?? {};
    if (row.action === "create_test") {
      const code = typeof nv.code === "string" ? nv.code : "";
      const name = typeof nv.officialName === "string" ? nv.officialName : "New test";
      entries.push({
        id: `audit:${row.id}`,
        at: row.created_at,
        kind: "test_added",
        title: `Test added to the catalog: ${name}`,
        detail: code || null,
      });
    } else if (row.action === "set_availability") {
      const status = typeof nv.availability === "string" ? (nv.availability as AvailabilityStatus) : null;
      const label = (row.entity === "profile_prices" ? profileLabels : testLabels)[row.entity_id ?? ""] ?? "A priced item";
      entries.push({
        id: `audit:${row.id}`,
        at: row.created_at,
        kind: "availability_changed",
        title: `${label} marked ${status ? AVAILABILITY_LABELS[status] : "changed"}`,
        detail: null,
      });
    } else if (row.action === "set_profile_price") {
      const label = profileLabels[row.entity_id ?? ""] ?? "A profile";
      entries.push({
        id: `audit:${row.id}`,
        at: row.created_at,
        kind: "profile_price_changed",
        title: `${label} bundle price updated`,
        detail: null,
      });
    }
  }

  entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return entries.slice(0, limit);
}

type Client = ReturnType<typeof createAdminClient>;

async function labelsForTestPrices(supabase: Client, priceIds: string[]): Promise<Record<string, string>> {
  if (priceIds.length === 0) return {};
  const { data, error } = await supabase
    .from("test_prices")
    .select("id, tests(official_name)")
    .in("id", priceIds);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const row of (data ?? []) as { id: string; tests: { official_name: string } | { official_name: string }[] | null }[]) {
    out[row.id] = one(row.tests)?.official_name ?? "A test";
  }
  return out;
}

async function labelsForProfilePrices(supabase: Client, priceIds: string[]): Promise<Record<string, string>> {
  if (priceIds.length === 0) return {};
  const { data, error } = await supabase
    .from("profile_prices")
    .select("id, profiles(name)")
    .in("id", priceIds);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const row of (data ?? []) as { id: string; profiles: { name: string } | { name: string }[] | null }[]) {
    out[row.id] = one(row.profiles)?.name ?? "A profile";
  }
  return out;
}
