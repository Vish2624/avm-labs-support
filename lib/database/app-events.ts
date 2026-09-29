import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "./fetch-all-rows";
import type { AppEvent, AppEventKind, AppEventKeyRole } from "@/types/app-event";

const APP_EVENT_COLUMNS = "id, kind, feature, key_role, message, detail, created_at";

interface AppEventRow {
  id: string;
  kind: AppEventKind;
  feature: string;
  key_role: AppEventKeyRole | null;
  message: string;
  detail: string | null;
  created_at: string;
}

function mapAppEvent(row: AppEventRow): AppEvent {
  return {
    id: row.id,
    kind: row.kind,
    feature: row.feature,
    keyRole: row.key_role,
    message: row.message,
    detail: row.detail,
    createdAt: row.created_at,
  };
}

export interface NewAppEvent {
  kind: AppEventKind;
  /** The part of the app: paste, image, search, assistant, catalog… */
  feature: string;
  keyRole?: AppEventKeyRole | null;
  /** Plain-words summary for admins. Never customer text. */
  message: string;
  /** Short technical note (model, HTTP status). */
  detail?: string | null;
}

/** The same problem is logged at most once per this window per server instance, so a burst doesn't flood the log. */
const REPEAT_WINDOW_MS = 30_000;
const lastLogged = new Map<string, number>();

/**
 * Records a problem for Admin > System health. Never throws and never
 * blocks the request it's called from — logging must not become a failure
 * of its own. Also written to the server log (Vercel > Logs).
 */
export function recordAppEvent(event: NewAppEvent): void {
  const dedupeKey = [event.kind, event.feature, event.keyRole ?? "", event.message].join("|");
  const now = Date.now();
  if (now - (lastLogged.get(dedupeKey) ?? 0) < REPEAT_WINDOW_MS) return;
  lastLogged.set(dedupeKey, now);

  console.error(
    `[system-health] ${event.kind} · ${event.feature}${event.keyRole ? ` (${event.keyRole} key)` : ""}: ${event.message}${
      event.detail ? ` — ${event.detail}` : ""
    }`
  );
  void (async () => {
    try {
      const { error } = await createAdminClient()
        .from("app_events")
        .insert({
          kind: event.kind,
          feature: event.feature.slice(0, 40),
          key_role: event.keyRole ?? null,
          message: event.message.slice(0, 300),
          detail: event.detail ? event.detail.slice(0, 300) : null,
        });
      if (error) console.error("[system-health] could not save event:", error.message);
    } catch (error) {
      console.error("[system-health] could not save event:", error);
    }
  })();
}

/** Every event since `since` (ISO time), newest first — for Admin > System health. */
export async function listAppEventsSince(since: string): Promise<AppEvent[]> {
  const supabase = createAdminClient();
  const rows = await fetchAllRows<AppEventRow>((from, to) =>
    supabase
      .from("app_events")
      .select(APP_EVENT_COLUMNS)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .range(from, to)
  );
  return rows.map(mapAppEvent);
}

/** Deletes events older than `before` (ISO time), so the log stays small. */
export async function deleteAppEventsBefore(before: string): Promise<void> {
  const { error } = await createAdminClient().from("app_events").delete().lt("created_at", before);
  if (error) throw error;
}
