import "server-only";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "./fetch-all-rows";
import type { ApiCall, ApiCallOutcome, ApiKey, ApiKeyRole } from "@/types/api-key";

// Gemini keys (api_keys) and the log of every request sent with them
// (api_calls) — Admin > API usage, and lib/ai/gemini.ts's key choice.
// Keys set as Vercel environment variables get a row too (env_name set,
// secret left in Vercel), created the first time they're seen, so every
// key has one id to count calls against. If the tables don't exist yet
// (the migration hasn't been run), the env keys still work — they just
// aren't counted.

/** The Vercel environment variables the app reads keys from, and the feature each serves first. */
export const ENV_KEYS: readonly { envName: string; role: ApiKeyRole; label: string }[] = [
  { envName: "GEMINI_API_KEY", role: "reader", label: "Paste text key" },
  { envName: "GEMINI_API_KEY_IMAGE", role: "image", label: "Prescription images key" },
  { envName: "GEMINI_API_KEY_SEARCH", role: "search", label: "Search AI key" },
  { envName: "GEMINI_API_KEY_ASSISTANT", role: "assistant", label: "Support Assistant key" },
  { envName: "GEMINI_API_KEY_BACKUP", role: "backup", label: "Backup key" },
];

const KEY_COLUMNS = "id, label, role, env_name, api_key, daily_limit, active, created_at";

interface ApiKeyRow {
  id: string;
  label: string;
  role: ApiKeyRole;
  env_name: string | null;
  api_key: string | null;
  daily_limit: number | null;
  active: boolean;
  created_at: string;
}

const secretOf = (row: Pick<ApiKeyRow, "env_name" | "api_key">) =>
  (row.api_key ?? (row.env_name ? process.env[row.env_name] : undefined))?.trim() || null;

function mapApiKey(row: ApiKeyRow): ApiKey {
  const secret = secretOf(row);
  return {
    id: row.id,
    label: row.label,
    role: row.role,
    envName: row.env_name,
    hint: secret ? secret.slice(-4) : null,
    dailyLimit: row.daily_limit,
    active: row.active,
    createdAt: row.created_at,
  };
}

/** Every key row, adding rows for env keys that are set but not listed yet. */
async function loadKeyRows(): Promise<ApiKeyRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("api_keys").select(KEY_COLUMNS).order("created_at");
  if (error) throw error;
  const rows = (data ?? []) as ApiKeyRow[];
  const missing = ENV_KEYS.filter(({ envName }) => process.env[envName]?.trim() && !rows.some((row) => row.env_name === envName));
  if (missing.length > 0) {
    const { data: added, error: insertError } = await supabase
      .from("api_keys")
      .upsert(
        missing.map(({ envName, role, label }) => ({ env_name: envName, role, label })),
        { onConflict: "env_name", ignoreDuplicates: true }
      )
      .select(KEY_COLUMNS);
    if (insertError) throw insertError;
    rows.push(...((added ?? []) as ApiKeyRow[]));
  }
  return rows;
}

/** A key ready to send requests with. id is null when the tables aren't there to count it. */
export interface UsableKey {
  id: string | null;
  role: ApiKeyRole;
  label: string;
  apiKey: string;
}

const CACHE_MS = 60_000;
let cached: { at: number; keys: UsableKey[] } | null = null;

/**
 * Active keys with a secret, env keys first then added keys (oldest
 * first). Cached for a minute per server instance; changes on the admin
 * page clear it here and reach other instances within the minute.
 */
export async function loadUsableKeys(): Promise<UsableKey[]> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.keys;
  let keys: UsableKey[];
  try {
    keys = (await loadKeyRows())
      .filter((row) => row.active)
      .sort((a, b) => Number(Boolean(a.api_key)) - Number(Boolean(b.api_key)))
      .flatMap((row) => {
        const apiKey = secretOf(row);
        return apiKey ? [{ id: row.id, role: row.role, label: row.label, apiKey }] : [];
      });
  } catch {
    // No api_keys table yet (or the DB is unreachable): the env keys still work.
    keys = ENV_KEYS.flatMap(({ envName, role, label }) => {
      const apiKey = process.env[envName]?.trim();
      return apiKey ? [{ id: null, role, label, apiKey }] : [];
    });
  }
  cached = { at: Date.now(), keys };
  return keys;
}

export function clearKeyCache(): void {
  cached = null;
}

/** Every key for Admin > API usage (secrets masked), or null when the migration hasn't been run. */
export async function listApiKeys(): Promise<ApiKey[] | null> {
  try {
    return (await loadKeyRows()).map(mapApiKey);
  } catch {
    return null;
  }
}

/** The secret of one key, for testing it. */
export async function getApiKeySecret(id: string): Promise<string | null> {
  const { data, error } = await createAdminClient().from("api_keys").select("env_name, api_key").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? secretOf(data as Pick<ApiKeyRow, "env_name" | "api_key">) : null;
}

export async function createApiKey(input: { label: string; role: ApiKeyRole; apiKey: string; dailyLimit: number | null }): Promise<ApiKey> {
  const { data, error } = await createAdminClient()
    .from("api_keys")
    .insert({ label: input.label, role: input.role, api_key: input.apiKey, daily_limit: input.dailyLimit })
    .select(KEY_COLUMNS)
    .single();
  if (error) throw error;
  clearKeyCache();
  return mapApiKey(data as ApiKeyRow);
}

export async function updateApiKey(
  id: string,
  changes: Partial<{ label: string; role: ApiKeyRole; dailyLimit: number | null; active: boolean }>
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (changes.label !== undefined) patch.label = changes.label;
  if (changes.role !== undefined) patch.role = changes.role;
  if (changes.dailyLimit !== undefined) patch.daily_limit = changes.dailyLimit;
  if (changes.active !== undefined) patch.active = changes.active;
  const { error } = await createAdminClient().from("api_keys").update(patch).eq("id", id);
  if (error) throw error;
  clearKeyCache();
}

/** Removes a key added on the page. Env keys can only be paused (their secret lives in Vercel). */
export async function deleteApiKey(id: string): Promise<boolean> {
  const { data, error } = await createAdminClient().from("api_keys").delete().eq("id", id).is("env_name", null).select("id");
  if (error) throw error;
  clearKeyCache();
  return (data ?? []).length > 0;
}

export interface NewApiCall {
  keyId: string | null;
  feature: string;
  model: string;
  outcome: ApiCallOutcome;
  httpStatus: number | null;
  latencyMs: number;
}

/**
 * Logs one Gemini request. Never throws or slows the request down: the
 * write runs after the response is sent (next/server after()), or straight
 * away in the background outside a request.
 */
export function recordApiCall(call: NewApiCall): void {
  if (!call.keyId) return;
  const write = async () => {
    try {
      const { error } = await createAdminClient()
        .from("api_calls")
        .insert({
          key_id: call.keyId,
          feature: call.feature.slice(0, 40),
          model: call.model.slice(0, 80),
          outcome: call.outcome,
          http_status: call.httpStatus,
          latency_ms: Math.max(0, Math.round(call.latencyMs)),
        });
      if (error) console.error("[api-usage] could not log call:", error.message);
    } catch (error) {
      console.error("[api-usage] could not log call:", error);
    }
  };
  try {
    after(write);
  } catch {
    void write();
  }
}

interface ApiCallRow {
  key_id: string | null;
  feature: string;
  model: string;
  outcome: ApiCallOutcome;
  http_status: number | null;
  latency_ms: number;
  created_at: string;
}

/** Every call since `since` (ISO time), oldest first. */
export async function listApiCallsSince(since: string): Promise<ApiCall[]> {
  const supabase = createAdminClient();
  const rows = await fetchAllRows<ApiCallRow>((from, to) =>
    supabase
      .from("api_calls")
      .select("key_id, feature, model, outcome, http_status, latency_ms, created_at")
      .gte("created_at", since)
      .order("id")
      .range(from, to)
  );
  return rows.map((row) => ({
    keyId: row.key_id,
    feature: row.feature,
    model: row.model,
    outcome: row.outcome,
    httpStatus: row.http_status,
    latencyMs: row.latency_ms,
    createdAt: row.created_at,
  }));
}

export async function deleteApiCallsBefore(before: string): Promise<void> {
  const { error } = await createAdminClient().from("api_calls").delete().lt("created_at", before);
  if (error) throw error;
}
