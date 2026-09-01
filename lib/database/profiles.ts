import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile, ProfilePrice } from "@/types/profile";
import type { ServiceType } from "@/lib/constants/service-types";

const PROFILE_COLUMNS = "id, code, name, description, active, created_at, updated_at";

interface ProfileRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

function mapProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface ProfileWithTestIds {
  profile: Profile;
  testIds: string[];
}

interface ProfileWithTestsRow extends ProfileRow {
  profile_tests: { test_id: string }[];
}

/**
 * Every active profile with its component test ids — the candidate set
 * findMatchingProfiles() ranks against (see lib/profiles/calculate-profile-match.ts).
 */
export async function listActiveProfilesWithTests(): Promise<ProfileWithTestIds[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(`${PROFILE_COLUMNS}, profile_tests(test_id)`)
    .eq("active", true);

  if (error) throw error;

  return ((data ?? []) as ProfileWithTestsRow[]).map((row) => ({
    profile: mapProfile(row),
    testIds: row.profile_tests.map((pt) => pt.test_id),
  }));
}

const PROFILE_PRICE_COLUMNS =
  "id, profile_id, location_id, service_type, price, currency_code, tat_text, availability, effective_from, effective_to, version_id";

interface ProfilePriceRow {
  id: string;
  profile_id: string;
  location_id: string;
  service_type: ServiceType;
  price: number;
  currency_code: string;
  tat_text: string;
  availability: ProfilePrice["availability"];
  effective_from: string;
  effective_to: string | null;
  version_id: string | null;
}

function mapProfilePrice(row: ProfilePriceRow): ProfilePrice {
  return {
    id: row.id,
    profileId: row.profile_id,
    locationId: row.location_id,
    serviceType: row.service_type,
    price: row.price,
    currencyCode: row.currency_code,
    tatText: row.tat_text,
    availability: row.availability,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    versionId: row.version_id,
  };
}

/**
 * Current (effective_to null) bundle prices for a set of profiles at one
 * location + service type. A profile with no current price row here (not
 * carried at this location/service type) is simply absent — never
 * backfilled or computed from component test prices (spec: fixed bundle
 * price only).
 */
export async function getCurrentProfilePrices(
  profileIds: string[],
  locationId: string,
  serviceType: ServiceType
): Promise<ProfilePrice[]> {
  if (profileIds.length === 0) return [];

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("profile_prices")
    .select(PROFILE_PRICE_COLUMNS)
    .in("profile_id", profileIds)
    .eq("location_id", locationId)
    .eq("service_type", serviceType)
    .is("effective_to", null);

  if (error) throw error;
  return ((data ?? []) as ProfilePriceRow[]).map(mapProfilePrice);
}
