import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
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
