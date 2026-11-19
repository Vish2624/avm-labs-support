import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { cachedCatalogRead } from "./catalog-cache";
import { fetchAllRows } from "./fetch-all-rows";
import { getLocationById } from "./locations";
import type { LocationCode } from "@/lib/constants/locations";
import type { SuggestionProfile, SuggestionRules, SuggestionTest } from "@/lib/profiles/website-suggestions";
import {
  buildWebsiteSearchExtras,
  type WebsiteSearchExtras,
  type WebsiteSearchProfile,
} from "@/lib/search/catalog/website-extras";

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
/**
 * Each location's free home collection limit from the website's rules, in
 * the location currency's minor unit, keyed by location id. A profile priced
 * at or above it comes with free home collection and no volume discount
 * (lib/pricing/discount.ts). Locations without a pushed rule are left out.
 */
export function loadHomeCollectionLimits(
  locations: { id: string; code: LocationCode; currencyCode: string }[]
): Promise<Record<string, number>> {
  return cachedCatalogRead(`home-collection-limits:${locations.map((l) => l.id).join(",")}`, async () => {
    const supabase = createAdminClient();
    const { data, error } = await supabase.from("website_sync").select("rules").eq("id", 1).maybeSingle();
    if (error) throw error;
    const rules = data?.rules as Record<string, { hcFree?: number }> | null;
    return Object.fromEntries(
      locations.flatMap((location) => {
        const hcFree = rules?.[WEBSITE_COUNTRY[location.code]]?.hcFree;
        return typeof hcFree === "number" && hcFree > 0
          ? [[location.id, Math.round(hcFree * minorUnit(location.currencyCode))] as const]
          : [];
      })
    );
  });
}

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

interface SearchTestRow {
  id: string;
  website_id: string;
  official_name: string;
  short_name: string | null;
  /** details->parameters: the website's parameter names (a JSON array). */
  parameters: unknown;
}

interface SearchProfileRow {
  id: string;
  code: string;
  name: string;
  /** details->subs: the website's "What's included" groups, with website test ids. */
  subs: unknown;
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.trim() !== "") : [];

/**
 * What search finds beyond test names and aliases, from what the website
 * pushed (see lib/search/catalog/website-extras.ts): its tests' parameters,
 * the groups inside its profiles, and the calculated items they report.
 * Live tests and profiles only. From the cached catalog.
 */
export function loadWebsiteSearchExtras(): Promise<WebsiteSearchExtras> {
  return cachedCatalogRead("website-search-extras", async () => {
    const supabase = createAdminClient();
    const [testRows, profileRows] = await Promise.all([
      fetchAllRows<SearchTestRow>((from, to) =>
        supabase
          .from("tests")
          .select("id, website_id, official_name, short_name, parameters:details->parameters")
          .eq("active", true)
          .not("website_id", "is", null)
          .order("id")
          .range(from, to)
      ),
      fetchAllRows<SearchProfileRow>((from, to) =>
        supabase
          .from("profiles")
          .select("id, code, name, subs:details->subs")
          .eq("active", true)
          .eq("website_kind", "profile")
          .order("id")
          .range(from, to)
      ),
    ]);

    const idByWebsiteId = new Map(testRows.map((row) => [row.website_id, row.id]));
    const profiles: WebsiteSearchProfile[] = profileRows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      subs: (Array.isArray(row.subs) ? row.subs : []).flatMap((sub) =>
        sub && typeof sub === "object" && typeof sub.name === "string"
          ? [
              {
                name: sub.name,
                tests: strings(sub.tests).flatMap((wid) => idByWebsiteId.get(wid) ?? []),
                calc: strings(sub.calc),
              },
            ]
          : []
      ),
    }));
    return buildWebsiteSearchExtras({
      tests: testRows.map((row) => ({
        id: row.id,
        officialName: row.official_name,
        shortName: row.short_name,
        parameters: strings(row.parameters),
      })),
      profiles,
    });
  });
}
