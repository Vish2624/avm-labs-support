import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile, ProfilePrice } from "@/types/profile";
import type { ServiceType } from "@/lib/constants/service-types";
import { cachedCatalogRead, invalidatesCatalog } from "@/lib/database/catalog-cache";
import { fetchAllRows } from "./fetch-all-rows";

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
export function listActiveProfilesWithTests(): Promise<ProfileWithTestIds[]> {
  return cachedCatalogRead("profiles:active", async () => {
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
  });
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

  // Served from the catalog cache: every current bundle price at this
  // location/service type, filtered in memory.
  const all = await cachedCatalogRead(`profile-prices:${locationId}:${serviceType}`, async () => {
    const supabase = createAdminClient();
    const rows = await fetchAllRows<ProfilePriceRow>((from, to) =>
      supabase
        .from("profile_prices")
        .select(PROFILE_PRICE_COLUMNS)
        .eq("location_id", locationId)
        .eq("service_type", serviceType)
        .is("effective_to", null)
        .order("id")
        .range(from, to)
    );
    return rows.map(mapProfilePrice);
  });
  const wanted = new Set(profileIds);
  return all.filter((price) => wanted.has(price.profileId));
}

export interface ProfilePriceWithProfile extends ProfilePrice {
  profileCode: string;
  profileName: string;
}

/**
 * Every current profile bundle price, optionally filtered by
 * location/service type, joined with its profile's code/name — the Admin
 * Availability table needs this shape (alongside the equivalent test-price
 * join in lib/database/prices.ts).
 */
export async function listCurrentProfilePricesWithProfileInfo(filter?: {
  locationId?: string;
  serviceType?: ServiceType;
}): Promise<ProfilePriceWithProfile[]> {
  const supabase = createAdminClient();
  let query = supabase
    .from("profile_prices")
    .select(`${PROFILE_PRICE_COLUMNS}, profiles(code, name)`)
    .is("effective_to", null);

  if (filter?.locationId) query = query.eq("location_id", filter.locationId);
  if (filter?.serviceType) query = query.eq("service_type", filter.serviceType);

  const { data, error } = await query;
  if (error) throw error;

  type JoinedRow = ProfilePriceRow & { profiles: { code: string; name: string } | { code: string; name: string }[] | null };
  return ((data ?? []) as unknown as JoinedRow[]).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return { ...mapProfilePrice(row), profileCode: profile?.code ?? "", profileName: profile?.name ?? "" };
  });
}

/** Directly updates one current profile-price row's availability — an admin quick-edit, not a versioned import. */
async function updateProfilePriceAvailabilityUncached(priceId: string, availability: ProfilePrice["availability"]): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("profile_prices").update({ availability }).eq("id", priceId);
  if (error) throw error;
}

export interface ProfileWithTestCount extends Profile {
  testCount: number;
}

/** Every profile, active or not, with its component test count — the Admin Profiles table. */
export async function listAllProfilesForAdmin(): Promise<ProfileWithTestCount[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(`${PROFILE_COLUMNS}, profile_tests(test_id)`)
    .order("code", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as ProfileWithTestsRow[]).map((row) => ({
    ...mapProfile(row),
    testCount: row.profile_tests.length,
  }));
}

/** A profile's component tests (id + required flag), regardless of the profile's own active flag — the Admin profile detail view. */
export async function getProfileTestSelections(profileId: string): Promise<{ testId: string; required: boolean }[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("profile_tests")
    .select("test_id, required")
    .eq("profile_id", profileId);
  if (error) throw error;
  return ((data ?? []) as { test_id: string; required: boolean }[]).map((row) => ({
    testId: row.test_id,
    required: row.required,
  }));
}

export async function getProfileById(id: string): Promise<Profile | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? mapProfile(data as ProfileRow) : null;
}

export interface ProfileInput {
  code: string;
  name: string;
  description: string | null;
}

async function createProfileUncached(input: ProfileInput): Promise<Profile> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .insert({ code: input.code, name: input.name, description: input.description })
    .select(PROFILE_COLUMNS)
    .single();
  if (error) throw error;
  return mapProfile(data as ProfileRow);
}

async function updateProfileUncached(id: string, input: ProfileInput): Promise<Profile> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ code: input.code, name: input.name, description: input.description })
    .eq("id", id)
    .select(PROFILE_COLUMNS)
    .single();
  if (error) throw error;
  return mapProfile(data as ProfileRow);
}

async function setProfileActiveUncached(id: string, active: boolean): Promise<Profile> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ active })
    .eq("id", id)
    .select(PROFILE_COLUMNS)
    .single();
  if (error) throw error;
  return mapProfile(data as ProfileRow);
}

/**
 * Replaces a profile's full set of component tests. This is a low-volume,
 * admin-curated join table (not the price-critical import path), so a
 * plain delete-then-insert is an acceptable, simple way to apply a diff —
 * unlike price activation, a partial failure here just means the admin
 * retries, with no pricing-correctness risk.
 */
async function setProfileTestsUncached(
  profileId: string,
  tests: { testId: string; required: boolean }[]
): Promise<void> {
  const supabase = createAdminClient();

  const { error: deleteError } = await supabase.from("profile_tests").delete().eq("profile_id", profileId);
  if (deleteError) throw deleteError;

  if (tests.length === 0) return;

  const { error: insertError } = await supabase
    .from("profile_tests")
    .insert(tests.map((test) => ({ profile_id: profileId, test_id: test.testId, required: test.required })));
  if (insertError) throw insertError;
}

/** A profile's current (effective_to null) bundle prices across every location/service type — the Admin profile detail view. */
export async function listProfilePricesForProfile(profileId: string): Promise<ProfilePrice[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("profile_prices")
    .select(PROFILE_PRICE_COLUMNS)
    .eq("profile_id", profileId)
    .is("effective_to", null);
  if (error) throw error;
  return ((data ?? []) as ProfilePriceRow[]).map(mapProfilePrice);
}

/**
 * Sets a profile's bundle price at one location + service type — a direct
 * admin correction (update in place if a current row exists, insert if
 * not), not a versioned import. Unlike the Excel pipeline's temporal
 * close-out/reopen, this doesn't need history: profile pricing is
 * admin-form-managed by design (assumption 5, AVM_PLAN.md), so there's no
 * "previous version" to preserve the way there is for Excel-driven prices.
 */
async function upsertProfilePriceUncached(input: {
  profileId: string;
  locationId: string;
  serviceType: ServiceType;
  price: number;
  currencyCode: string;
  tatText: string;
  availability: ProfilePrice["availability"];
}): Promise<ProfilePrice> {
  const supabase = createAdminClient();

  const { data: existing, error: findError } = await supabase
    .from("profile_prices")
    .select("id")
    .eq("profile_id", input.profileId)
    .eq("location_id", input.locationId)
    .eq("service_type", input.serviceType)
    .is("effective_to", null)
    .maybeSingle();
  if (findError) throw findError;

  const patch = {
    price: input.price,
    currency_code: input.currencyCode,
    tat_text: input.tatText,
    availability: input.availability,
  };

  if (existing) {
    const { data, error } = await supabase
      .from("profile_prices")
      .update(patch)
      .eq("id", existing.id)
      .select(PROFILE_PRICE_COLUMNS)
      .single();
    if (error) throw error;
    return mapProfilePrice(data as ProfilePriceRow);
  }

  const { data, error } = await supabase
    .from("profile_prices")
    .insert({ profile_id: input.profileId, location_id: input.locationId, service_type: input.serviceType, ...patch })
    .select(PROFILE_PRICE_COLUMNS)
    .single();
  if (error) throw error;
  return mapProfilePrice(data as ProfilePriceRow);
}

// Writes drop the search catalog cache (lib/database/catalog-cache.ts) once they settle.
export const updateProfilePriceAvailability = invalidatesCatalog(updateProfilePriceAvailabilityUncached);
export const createProfile = invalidatesCatalog(createProfileUncached);
export const updateProfile = invalidatesCatalog(updateProfileUncached);
export const setProfileActive = invalidatesCatalog(setProfileActiveUncached);
export const setProfileTests = invalidatesCatalog(setProfileTestsUncached);
export const upsertProfilePrice = invalidatesCatalog(upsertProfilePriceUncached);
