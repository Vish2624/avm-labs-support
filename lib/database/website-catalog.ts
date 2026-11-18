import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { cachedCatalogRead } from "./catalog-cache";
import { fetchAllRows } from "./fetch-all-rows";
import { getLocationById } from "./locations";
import type { LocationCode } from "@/lib/constants/locations";
import type { SuggestionProfile, SuggestionRules, SuggestionTest } from "@/lib/profiles/website-suggestions";

// Which website country each location takes its prices and rules from.
// Same mapping as apply_website_catalog() (supabase/migrations/20261115120000_website_catalog.sql).
const WEBSITE_COUNTRY: Record<LocationCode, string> = { DUB: "AE", RUH: "SA", KHO: "SA", BAH: "BH" };

const minorUnit = (currencyCode: string) => (currencyCode === "BHD" ? 1000 : 100);

interface TestRow {
  id: string;
  website_id: string;
  /** details->categories: the website's test categories (a JSON array). */
  categories: unknown;
}

interface PriceRow {
  test_id: string;
  price: number;
}

interface ProfileRow {
  id: string;
  category: string | null;
  recommended: boolean | null;
  profile_tests: { test_id: string }[];
  profile_prices: { price: number }[];
}

export interface WebsiteSuggestionData {
  tests: SuggestionTest[];
  profiles: SuggestionProfile[];
  /** null until the first push from the website. */
  rules: SuggestionRules | null;
}

/**
 * What the website's profile suggestions need at one location (see
 * lib/profiles/website-suggestions.ts): its live tests with their price
 * here and categories, its live profiles (special ones aren't suggested,
 * as on the website) with their live tests and price here, and the
 * country's minimum billing and free home collection limit. From the
 * cached catalog, so it costs nothing per keystroke.
 */
export function loadWebsiteSuggestionData(locationId: string): Promise<WebsiteSuggestionData> {
  return cachedCatalogRead(`website-suggestions:${locationId}`, async () => {
    const supabase = createAdminClient();
    const location = await getLocationById(locationId);
    if (!location) return { tests: [], profiles: [], rules: null };

    const [testRows, priceRows, profileResult, syncResult] = await Promise.all([
      fetchAllRows<TestRow>((from, to) =>
        supabase
          .from("tests")
          .select("id, website_id, categories:details->categories")
          .eq("active", true)
          .not("website_id", "is", null)
          .order("id")
          .range(from, to)
      ),
      fetchAllRows<PriceRow>((from, to) =>
        supabase
          .from("test_prices")
          .select("test_id, price")
          .eq("location_id", locationId)
          .is("effective_to", null)
          .order("id")
          .range(from, to)
      ),
      supabase
        .from("profiles")
        .select(
          "id, category:details->>category, recommended:details->recommended, profile_tests(test_id), profile_prices(price)"
        )
        .eq("active", true)
        .eq("website_kind", "profile")
        .eq("profile_prices.location_id", locationId)
        .eq("profile_prices.service_type", "in_house")
        .is("profile_prices.effective_to", null),
      supabase.from("website_sync").select("rules").eq("id", 1).maybeSingle(),
    ]);
    if (profileResult.error) throw profileResult.error;
    if (syncResult.error) throw syncResult.error;

    const priceByTest = new Map(priceRows.map((row) => [row.test_id, row.price]));
    const tests = testRows.map((row) => ({
      id: row.id,
      websiteId: row.website_id,
      price: priceByTest.get(row.id) ?? 0,
      categories: Array.isArray(row.categories) ? row.categories.filter((c): c is string => typeof c === "string") : [],
    }));
    const live = new Set(tests.map((test) => test.id));
    const profiles = ((profileResult.data ?? []) as ProfileRow[]).map((row) => ({
      id: row.id,
      price: row.profile_prices[0]?.price ?? 0,
      // As on the website, a profile's hidden tests aren't counted.
      testIds: row.profile_tests.map((pt) => pt.test_id).filter((id) => live.has(id)),
      category: row.category ?? "",
      recommended: row.recommended === true,
    }));

    const country = (syncResult.data?.rules as Record<string, { minBill: number; hcFree: number }> | null)?.[
      WEBSITE_COUNTRY[location.code]
    ];
    const unit = minorUnit(location.currencyCode);
    const rules = country
      ? { minBill: Math.round(country.minBill * unit), homeCollectionFreeFrom: Math.round(country.hcFree * unit) }
      : null;
    return { tests, profiles, rules };
  });
}

interface SyncRow {
  version: number;
  pushed_at: string | null;
  counts: Record<string, number> | null;
}

interface LegacyAliasRow {
  id: string;
  alias: string;
  old_code: string;
  old_name: string;
}

export interface WebsiteSyncStatus {
  version: number;
  pushedAt: string | null;
  counts: Record<string, number> | null;
  /** The team's old aliases not linked to a website test yet: no test with the same lab code or name. */
  unlinkedAliases: { id: string; alias: string; oldCode: string; oldName: string }[];
}

/** For Admin → Website catalog: the last push from the website, and the old aliases still waiting for a match. Read fresh. */
export async function getWebsiteSyncStatus(): Promise<WebsiteSyncStatus> {
  const supabase = createAdminClient();
  const [sync, legacy] = await Promise.all([
    supabase.from("website_sync").select("version, pushed_at, counts").eq("id", 1).maybeSingle(),
    supabase
      .from("legacy_aliases")
      .select("id, alias, old_code, old_name")
      .is("linked_test_id", null)
      .order("old_name")
      .order("alias"),
  ]);
  if (sync.error) throw sync.error;
  if (legacy.error) throw legacy.error;
  const row = sync.data as SyncRow | null;
  return {
    version: row?.version ?? 0,
    pushedAt: row?.pushed_at ?? null,
    counts: row?.counts ?? null,
    unlinkedAliases: ((legacy.data ?? []) as LegacyAliasRow[]).map((r) => ({
      id: r.id,
      alias: r.alias,
      oldCode: r.old_code,
      oldName: r.old_name,
    })),
  };
}
