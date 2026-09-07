import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Location } from "@/types/location";
import type { LocationCode } from "@/lib/constants/locations";

const LOCATION_COLUMNS =
  "id, code, name, country, currency_code, currency_symbol, active, created_at, updated_at";

interface LocationRow {
  id: string;
  code: LocationCode;
  name: string;
  country: string;
  currency_code: string;
  currency_symbol: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

function mapLocation(row: LocationRow): Location {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    country: row.country,
    currencyCode: row.currency_code,
    currencySymbol: row.currency_symbol,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Every active location — the source of truth for the workspace's location
 * switcher. Never hardcode a location list in the UI (spec section 91).
 *
 * Called fresh on 8 separate pages, so every single navigation was paying
 * for this exact same round-trip again. There's no admin flow anywhere in
 * the app that changes a location (they're seeded once via SQL), so a
 * 5-minute cache is free — nothing in-app can ever make it stale.
 */
export const listActiveLocations = unstable_cache(
  async (): Promise<Location[]> => {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("locations")
      .select(LOCATION_COLUMNS)
      .eq("active", true)
      .order("name", { ascending: true });

    if (error) throw error;
    return ((data ?? []) as LocationRow[]).map(mapLocation);
  },
  ["active-locations"],
  { revalidate: 300 }
);

/** One location by id, regardless of active flag (e.g. for import validation context). */
export async function getLocationById(id: string): Promise<Location | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("locations").select(LOCATION_COLUMNS).eq("id", id).maybeSingle();

  if (error) throw error;
  return data ? mapLocation(data as LocationRow) : null;
}
