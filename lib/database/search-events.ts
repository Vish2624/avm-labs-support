import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "./fetch-all-rows";
import type { SearchEvent } from "@/types/search";

const SEARCH_EVENT_COLUMNS =
  "id, query, normalized_query, location_id, result_count, picked_test_id, picked_rank, previous_miss_query, created_at";

interface SearchEventRow {
  id: string;
  query: string;
  normalized_query: string;
  location_id: string | null;
  result_count: number;
  picked_test_id: string | null;
  picked_rank: number | null;
  previous_miss_query: string | null;
  created_at: string;
}

function mapSearchEvent(row: SearchEventRow): SearchEvent {
  return {
    id: row.id,
    query: row.query,
    normalizedQuery: row.normalized_query,
    locationId: row.location_id,
    resultCount: row.result_count,
    pickedTestId: row.picked_test_id,
    pickedRank: row.picked_rank,
    previousMissQuery: row.previous_miss_query,
    createdAt: row.created_at,
  };
}

export interface NewSearchEvent {
  query: string;
  normalizedQuery: string;
  locationId: string | null;
  resultCount: number;
  pickedTestId: string | null;
  pickedRank: number | null;
  previousMissQuery: string | null;
}

/** Records one finished Support Workspace search (a pick or a miss) — see use-search-telemetry.ts. */
export async function insertSearchEvent(input: NewSearchEvent): Promise<SearchEvent> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("search_events")
    .insert({
      query: input.query,
      normalized_query: input.normalizedQuery,
      location_id: input.locationId,
      result_count: input.resultCount,
      picked_test_id: input.pickedTestId,
      picked_rank: input.pickedRank,
      previous_miss_query: input.previousMissQuery,
    })
    .select(SEARCH_EVENT_COLUMNS)
    .single();

  if (error) throw error;
  return mapSearchEvent(data as SearchEventRow);
}

/** Every logged search since `since` — the input to Admin > Missed searches. */
export async function listSearchEventsSince(since: Date): Promise<SearchEvent[]> {
  const supabase = createAdminClient();
  const rows = await fetchAllRows<SearchEventRow>((from, to) =>
    supabase
      .from("search_events")
      .select(SEARCH_EVENT_COLUMNS)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to)
  );
  return rows.map(mapSearchEvent);
}

/** Retention: drops everything logged before `before`. */
export async function deleteSearchEventsBefore(before: Date): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("search_events").delete().lt("created_at", before.toISOString());
  if (error) throw error;
}

/** Dismisses a "No results" entry: removes that query's zero-result rows. */
export async function deleteMissedSearchEvents(normalizedQuery: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("search_events")
    .delete()
    .eq("normalized_query", normalizedQuery)
    .eq("result_count", 0);
  if (error) throw error;
}

/** Dismisses a "Wrong top result" entry: removes that query's below-the-top picks of that test. */
export async function deleteMisrankedSearchEvents(normalizedQuery: string, testId: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("search_events")
    .delete()
    .eq("normalized_query", normalizedQuery)
    .eq("picked_test_id", testId)
    .gt("result_count", 0)
    .or("picked_rank.is.null,picked_rank.gt.1");
  if (error) throw error;
}
