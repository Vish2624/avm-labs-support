import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TestPrice } from "@/types/price";
import type { ServiceType } from "@/lib/constants/service-types";

const PRICE_COLUMNS =
  "id, test_id, location_id, service_type, price, currency_code, tat_text, availability, effective_from, effective_to, version_id, created_at, updated_at";

interface TestPriceRow {
  id: string;
  test_id: string;
  location_id: string;
  service_type: ServiceType;
  price: number;
  currency_code: string;
  tat_text: string;
  availability: TestPrice["availability"];
  effective_from: string;
  effective_to: string | null;
  version_id: string | null;
  created_at: string;
  updated_at: string;
}

function mapPrice(row: TestPriceRow): TestPrice {
  return {
    id: row.id,
    testId: row.test_id,
    locationId: row.location_id,
    serviceType: row.service_type,
    price: row.price,
    currencyCode: row.currency_code,
    tatText: row.tat_text,
    availability: row.availability,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    versionId: row.version_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Current (effective_to null) prices for a set of tests at one location +
 * service type. This is the join searchTests() applies after ranking
 * candidate tests, so a matched test with no current price here (not
 * carried at this location/service type) is simply absent from the map —
 * never backfilled.
 */
export async function getCurrentPrices(
  testIds: string[],
  locationId: string,
  serviceType: ServiceType
): Promise<TestPrice[]> {
  if (testIds.length === 0) return [];

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("test_prices")
    .select(PRICE_COLUMNS)
    .in("test_id", testIds)
    .eq("location_id", locationId)
    .eq("service_type", serviceType)
    .is("effective_to", null);

  if (error) throw error;
  return ((data ?? []) as TestPriceRow[]).map(mapPrice);
}

/** Every current price row for one test, across all locations/service types — for the Admin test detail view. */
export async function listCurrentPricesForTest(testId: string): Promise<TestPrice[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("test_prices")
    .select(PRICE_COLUMNS)
    .eq("test_id", testId)
    .is("effective_to", null);

  if (error) throw error;
  return ((data ?? []) as TestPriceRow[]).map(mapPrice);
}

export interface PriceWithTest extends TestPrice {
  testCode: string;
  testOfficialName: string;
  testCategory: string | null;
}

/**
 * Every current test price, optionally filtered by location/service type,
 * joined with its test's code/name/category — the Admin Availability table
 * and the Excel export both need this shape.
 */
export async function listCurrentPricesWithTestInfo(filter?: {
  locationId?: string;
  serviceType?: ServiceType;
}): Promise<PriceWithTest[]> {
  const supabase = createAdminClient();
  let query = supabase
    .from("test_prices")
    .select(`${PRICE_COLUMNS}, tests(code, official_name, category)`)
    .is("effective_to", null);

  if (filter?.locationId) query = query.eq("location_id", filter.locationId);
  if (filter?.serviceType) query = query.eq("service_type", filter.serviceType);

  const { data, error } = await query;
  if (error) throw error;

  type JoinedTest = { code: string; official_name: string; category: string | null };
  type JoinedRow = TestPriceRow & { tests: JoinedTest | JoinedTest[] | null };
  return ((data ?? []) as unknown as JoinedRow[]).map((row) => {
    const test = Array.isArray(row.tests) ? row.tests[0] : row.tests;
    return {
      ...mapPrice(row),
      testCode: test?.code ?? "",
      testOfficialName: test?.official_name ?? "",
      testCategory: test?.category ?? null,
    };
  });
}

/** Directly updates one current price row's availability — an admin quick-edit, not a versioned import. */
export async function updatePriceAvailability(
  priceId: string,
  availability: TestPrice["availability"]
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("test_prices").update({ availability }).eq("id", priceId);
  if (error) throw error;
}
