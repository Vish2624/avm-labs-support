import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/database/fetch-all-rows";
import { listAllTests, getTestById } from "@/lib/database/tests";
import { listAliasesForTest } from "@/lib/database/aliases";
import { getLocationById } from "@/lib/database/locations";
import {
  activatePriceListVersion,
  createPriceListVersion,
  insertStagingRows,
  updatePriceListVersion,
} from "@/lib/database/imports";
import { invalidateCatalogCache } from "@/lib/database/catalog-cache";
import { getCurrencyFractionDigits } from "@/lib/pricing/money";
import { parseTatHours } from "@/lib/utils/parse-tat-hours";
import { includedProfiles, type PackageRoster } from "@/lib/profiles/included-profiles";
import { listAllProfilesWithTestSelections } from "@/lib/database/profiles";
import { isPackage } from "@/lib/search/matching/is-package-name";
import { TEST_TYPE_CATEGORIES, calculatedCategory, type Test } from "@/types/test";
import type { ServiceType } from "@/lib/constants/service-types";
import type { AvailabilityStatus } from "@/lib/constants/availability";
import type {
  CatalogItemDetail,
  CatalogListItem,
  CatalogPrice,
  CatalogRef,
  CatalogType,
  ProfileReference,
} from "@/types/catalog";

// Admin catalog editing for the Test Master (Admin → Tests / Components /
// Calculated). A row's type lives in tests.category (types/test.ts), so
// every write here sets the category from the type and never from the form.
// Prices go through the same versioned import as the Excel uploads (one
// single-row version, activated by activate_price_list_version), so an edit
// shows up in Updates/import history like any other price change.

interface PriceRow {
  test_id: string;
  location_id: string;
  service_type: ServiceType;
  price: number;
  currency_code: string;
  tat_text: string;
  availability: AvailabilityStatus;
}

const toPrice = (row: PriceRow): CatalogPrice => ({
  locationId: row.location_id,
  serviceType: row.service_type,
  price: row.price,
  currencyCode: row.currency_code,
  tatText: row.tat_text,
  availability: row.availability,
});

async function currentPrices(testIds?: string[]): Promise<PriceRow[]> {
  const supabase = createAdminClient();
  const columns = "test_id, location_id, service_type, price, currency_code, tat_text, availability";
  if (testIds) {
    if (testIds.length === 0) return [];
    const { data, error } = await supabase.from("test_prices").select(columns).in("test_id", testIds).is("effective_to", null);
    if (error) throw error;
    return (data ?? []) as PriceRow[];
  }
  return fetchAllRows<PriceRow & { id: string }>((from, to) =>
    supabase.from("test_prices").select(`id, ${columns}`).is("effective_to", null).order("id").range(from, to)
  );
}

const categoryFor = (type: CatalogType | "parameter") => (type === "test" ? null : TEST_TYPE_CATEGORIES[type]);

/** "Mean Corpuscular Volume (MCV)" -> "MCV" — a parameter's short name, from its own name. */
const bracketed = (name: string) => name.match(/\(([^()]+)\)\s*$/)?.[1]?.trim() ?? null;

export async function listCatalog(type: CatalogType): Promise<CatalogListItem[]> {
  const tests = await listAllTests();
  const byId = new Map(tests.map((test) => [test.id, test]));
  const ofType = tests.filter((test) => test.testType === type);
  const pricesByTest = new Map<string, CatalogPrice[]>();
  if (type !== "calculated") {
    const wanted = new Set(ofType.map((test) => test.id));
    for (const row of await currentPrices()) {
      if (!wanted.has(row.test_id)) continue;
      pricesByTest.set(row.test_id, [...(pricesByTest.get(row.test_id) ?? []), toPrice(row)]);
    }
  }
  const parameterCount = new Map<string, number>();
  for (const test of tests) {
    for (const componentId of test.componentIds) parameterCount.set(componentId, (parameterCount.get(componentId) ?? 0) + 1);
  }
  return ofType
    .map((test) => ({
      id: test.id,
      code: test.code,
      officialName: test.officialName,
      shortName: test.shortName,
      description: test.description,
      testType: test.testType,
      active: test.active,
      prices: pricesByTest.get(test.id) ?? [],
      parameterCount: parameterCount.get(test.id) ?? 0,
      sourceNames: test.sourceTestIds.flatMap((id) => byId.get(id)?.officialName ?? []),
    }))
    .sort((a, b) => a.officialName.localeCompare(b.officialName, undefined, { sensitivity: "base" }));
}

export async function getCatalogItem(id: string): Promise<CatalogItemDetail | null> {
  const tests = await listAllTests();
  const test = tests.find((t) => t.id === id);
  if (!test) return null;
  const byId = new Map(tests.map((t) => [t.id, t]));
  const supabase = createAdminClient();
  const [aliases, prices, profileRows] = await Promise.all([
    listAliasesForTest(id),
    currentPrices([id]),
    supabase.from("profile_tests").select("profiles(id, code, name)").eq("test_id", id),
  ]);
  if (profileRows.error) throw profileRows.error;
  type ProfileJoin = { id: string; code: string; name: string };
  const profiles = ((profileRows.data ?? []) as unknown as { profiles: ProfileJoin | ProfileJoin[] | null }[])
    .flatMap((row) => (Array.isArray(row.profiles) ? row.profiles : row.profiles ? [row.profiles] : []))
    .map((p) => ({ id: p.id, code: p.code, name: p.name }));

  return {
    test,
    aliases,
    prices: prices.map(toPrice),
    parameters: tests
      .filter((t) => t.componentIds.includes(id))
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((t) => ({ id: t.id, code: t.code, officialName: t.officialName, shortName: t.shortName })),
    sources: test.sourceTestIds.flatMap((sourceId) => {
      const source = byId.get(sourceId);
      return source ? [{ id: source.id, code: source.code, name: source.officialName, testType: source.testType }] : [];
    }),
    usedIn: {
      profiles,
      calculated: tests
        .filter((t) => t.sourceTestIds.includes(id))
        .map((t): CatalogRef => ({ id: t.id, code: t.code, name: t.officialName, testType: t.testType })),
    },
  };
}

function nextCode(prefix: string, codes: string[]): string {
  const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`, "i");
  const max = codes.reduce((m, code) => Math.max(m, Number(code.match(pattern)?.[1] ?? 0)), 0);
  return `${prefix}-${String(max + 1).padStart(2, "0")}`;
}

export interface CatalogDetailsInput {
  code: string | null;
  officialName: string;
  shortName: string | null;
  description: string | null;
  /** Calculated parameters only: the profile code it's only ordered within, or null. */
  viaProfileCode?: string | null;
}

/** The category to store: the type's own, and for a calculated parameter which profile (if any) it's ordered within. */
async function categoryWith(type: CatalogType, viaProfileCode: string | null | undefined): Promise<string | null> {
  if (type !== "calculated" || !viaProfileCode) return categoryFor(type);
  const code = viaProfileCode.trim().toUpperCase();
  const profiles = await listProfileRosters();
  if (!profiles.some((p) => p.code.toUpperCase() === code)) throw new Error(`There's no profile ${code}.`);
  return calculatedCategory(code);
}

export async function createCatalogItem(type: CatalogType, input: CatalogDetailsInput): Promise<Test> {
  const supabase = createAdminClient();
  let code = input.code?.trim() || null;
  if (!code) {
    if (type !== "calculated") throw new Error("Code is required.");
    code = nextCode("CALC", (await listAllTests()).map((t) => t.code));
  }
  const { data, error } = await supabase
    .from("tests")
    .insert({
      code,
      official_name: input.officialName,
      short_name: input.shortName,
      description: input.description,
      category: await categoryWith(type, input.viaProfileCode),
    })
    .select("id")
    .single();
  invalidateCatalogCache();
  if (error) throw error.code === "23505" ? new Error(`Code ${code} is already used.`) : error;
  return (await getTestById(data.id))!;
}

export async function updateCatalogDetails(id: string, input: CatalogDetailsInput): Promise<void> {
  const existing = await getTestById(id);
  if (!existing) throw new Error("Not found.");
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("tests")
    .update({
      code: input.code?.trim() || existing.code,
      official_name: input.officialName,
      short_name: input.shortName,
      description: input.description,
      // The type never changes from an edit; a calculated parameter's "ordered within" profile can.
      category: existing.testType === "calculated" ? await categoryWith("calculated", input.viaProfileCode) : existing.category,
    })
    .eq("id", id);
  invalidateCatalogCache();
  if (error) throw error.code === "23505" ? new Error(`Code ${input.code} is already used.`) : error;
}

/**
 * Sets a test's or component's price at one location + service type as a
 * one-row price-list version, activated like an Excel import. `price` is in
 * the location's major unit (e.g. 45.50 AED).
 */
export async function setCatalogPrice(input: {
  testId: string;
  locationId: string;
  serviceType: ServiceType;
  price: number;
  tatText: string;
  availability: AvailabilityStatus;
  userId: string;
}): Promise<void> {
  const [test, location] = await Promise.all([getTestById(input.testId), getLocationById(input.locationId)]);
  if (!test) throw new Error("Not found.");
  if (test.testType !== "test" && test.testType !== "component") {
    throw new Error("Only tests and components have prices.");
  }
  if (!location) throw new Error("Unknown location.");
  if (!Number.isFinite(input.price) || input.price < 0) throw new Error("Enter a valid price.");
  if (!input.tatText.trim()) throw new Error("Enter a TAT.");
  const digits = getCurrencyFractionDigits(location.currencyCode);
  const minor = Math.round(input.price * 10 ** digits);
  if (Math.abs(input.price * 10 ** digits - minor) > 1e-6) {
    throw new Error(`${location.currencyCode} allows at most ${digits} decimals.`);
  }

  const version = await createPriceListVersion({
    locationId: location.id,
    serviceType: input.serviceType,
    originalFilename: `Admin edit — ${test.code}`,
    fileSize: 0,
    createdBy: input.userId,
  });
  await insertStagingRows(version.id, [
    {
      rowNumber: 1,
      rawRow: { source: "admin-catalog-edit" },
      parsed: {
        rowNumber: 1,
        testCode: test.code,
        testName: test.officialName,
        category: test.category,
        price: minor,
        tatText: input.tatText.trim(),
        availability: input.availability,
        notes: null,
        isNewTest: false,
      },
      rowStatus: "ok",
      errorMessages: [],
    },
  ]);
  await updatePriceListVersion(version.id, { status: "validated", recordCount: 1, validatedAt: new Date().toISOString() });
  await activatePriceListVersion(version.id, input.userId);
}

/** Stops offering a test at one location + service type: closes its current price (history kept). */
export async function removeCatalogPrice(testId: string, locationId: string, serviceType: ServiceType): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("test_prices")
    .update({ effective_to: new Date().toISOString() })
    .eq("test_id", testId)
    .eq("location_id", locationId)
    .eq("service_type", serviceType)
    .is("effective_to", null);
  invalidateCatalogCache();
  if (error) throw error;
}

/** Every active profile (not package) with its tests — what a package is built from. */
export async function listProfileRosters(): Promise<PackageRoster[]> {
  const all = await listAllProfilesWithTestSelections();
  return all
    .filter(({ profile }) => profile.active && !isPackage(profile))
    .map(({ profile, tests }) => ({ id: profile.id, code: profile.code, name: profile.name, testIds: tests.map((t) => t.testId) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * A package's guide figures per location: its included profiles' own
 * bundle prices plus its other measured tests' prices, and the slowest TAT
 * among them. A guide only — the package's price is whatever the admin sets.
 */
export async function packageReferences(testIds: string[], profiles: PackageRoster[]): Promise<ProfileReference[]> {
  const parts = includedProfiles(testIds, profiles);
  const covered = new Set(parts.flatMap((p) => p.testIds));
  const tests = (await listAllTests()).filter((t) => testIds.includes(t.id) && !covered.has(t.id));
  const measured = tests.filter((t) => t.testType === "test" || t.testType === "component");
  const supabase = createAdminClient();
  const [testPrices, profilePricesResult] = await Promise.all([
    currentPrices(measured.map((t) => t.id)),
    parts.length
      ? supabase
          .from("profile_prices")
          .select("profile_id, location_id, service_type, price, currency_code, tat_text")
          .in("profile_id", parts.map((p) => p.id))
          .is("effective_to", null)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (profilePricesResult.error) throw profilePricesResult.error;
  type Part = { key: string; locationId: string; price: number; currency: string; tat: string };
  const byLocation = new Map<string, Part[]>();
  const add = (part: Part) => byLocation.set(part.locationId, [...(byLocation.get(part.locationId) ?? []), part]);
  for (const row of testPrices) {
    add({ key: row.test_id, locationId: row.location_id, price: row.price, currency: row.currency_code, tat: row.tat_text });
  }
  for (const row of (profilePricesResult.data ?? []) as { profile_id: string; location_id: string; price: number; currency_code: string; tat_text: string }[]) {
    add({ key: row.profile_id, locationId: row.location_id, price: row.price, currency: row.currency_code, tat: row.tat_text });
  }
  const partNames = new Map<string, string>([
    ...parts.map((p): [string, string] => [p.id, p.name]),
    ...measured.map((t): [string, string] => [t.id, t.officialName]),
  ]);
  return [...byLocation.entries()].map(([locationId, rows]) => {
    // One price per part here (a part priced under both service types counts once).
    const unique = [...new Map(rows.map((r) => [r.key, r])).values()];
    const slowest = unique.reduce<Part | null>((best, row) => {
      const hours = parseTatHours(row.tat);
      const bestHours = best ? parseTatHours(best.tat) : null;
      return hours !== null && (bestHours === null || hours > bestHours) ? row : best;
    }, null);
    const priced = new Set(unique.map((r) => r.key));
    return {
      locationId,
      serviceType: "in_house" as ServiceType,
      sum: unique.reduce((total, row) => total + row.price, 0),
      currencyCode: unique[0].currency,
      slowestTat: slowest?.tat ?? null,
      unpriced: [...partNames.entries()].filter(([id]) => !priced.has(id)).map(([, name]) => name),
      parts: [...parts.map((p) => p.name), ...(measured.length ? [`${measured.length} test${measured.length === 1 ? "" : "s"}`] : [])],
    };
  });
}

/**
 * Moves a test's or component's prices to the other service type (In-House
 * <-> Outsourced) at every location: each price is re-set under the new type
 * (same amount, TAT and availability, as a versioned edit) and the old one
 * closed. An item is one or the other, never both.
 */
export async function moveCatalogServiceType(testId: string, to: ServiceType, userId: string): Promise<void> {
  const prices = await currentPrices([testId]);
  const moving = prices.filter((p) => p.service_type !== to);
  if (moving.length === 0) throw new Error("Nothing to move.");
  const clash = moving.find((p) => prices.some((q) => q.service_type === to && q.location_id === p.location_id));
  if (clash) throw new Error("It already has a price of that type at a location — remove one of them first.");
  for (const price of moving) {
    const digits = getCurrencyFractionDigits(price.currency_code);
    await setCatalogPrice({
      testId,
      locationId: price.location_id,
      serviceType: to,
      price: price.price / 10 ** digits,
      tatText: price.tat_text,
      availability: price.availability,
      userId,
    });
    await removeCatalogPrice(testId, price.location_id, price.service_type);
  }
}

/** Moves a profile's bundle prices to the other service type at every location (profile prices aren't versioned, so in place). */
export async function moveProfileServiceType(profileId: string, to: ServiceType): Promise<void> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("profile_prices")
    .select("id, location_id, service_type")
    .eq("profile_id", profileId)
    .is("effective_to", null);
  if (error) throw error;
  const rows = (data ?? []) as { id: string; location_id: string; service_type: ServiceType }[];
  const moving = rows.filter((r) => r.service_type !== to);
  if (moving.length === 0) throw new Error("Nothing to move.");
  if (moving.some((r) => rows.some((q) => q.service_type === to && q.location_id === r.location_id))) {
    throw new Error("It already has a price of that type at a location — remove one of them first.");
  }
  try {
    const { error: updateError } = await supabase.from("profile_prices").update({ service_type: to }).in("id", moving.map((r) => r.id));
    if (updateError) throw updateError;
  } finally {
    invalidateCatalogCache();
  }
}

/** Stops offering a profile at one location + service type. */
export async function removeProfilePrice(profileId: string, locationId: string, serviceType: ServiceType): Promise<void> {
  const supabase = createAdminClient();
  try {
    const { error } = await supabase
      .from("profile_prices")
      .delete()
      .eq("profile_id", profileId)
      .eq("location_id", locationId)
      .eq("service_type", serviceType)
      .is("effective_to", null);
    if (error) throw error;
  } finally {
    invalidateCatalogCache();
  }
}

/**
 * Replaces a component's parameter list, in the given order. Kept rows (with
 * an id) are renamed in place, new rows become parameters, and removed ones
 * are deleted — unless another component still uses them, then they're only
 * unlinked from this one. The order is kept in the codes: this component's
 * own parameters are renumbered `<COMPONENT>-01`, `-02`, … in list order.
 */
export async function saveParameters(componentId: string, rows: { id?: string; name: string }[]): Promise<void> {
  const tests = await listAllTests();
  const component = tests.find((t) => t.id === componentId);
  if (!component || component.testType !== "component") throw new Error("Not a component.");
  const names = rows.map((row) => row.name.replace(/\s+/g, " ").trim());
  if (names.some((name) => !name)) throw new Error("A parameter name is empty.");
  const dup = names.find((name, i) => names.findIndex((n) => n.toLowerCase() === name.toLowerCase()) !== i);
  if (dup) throw new Error(`"${dup}" is listed twice.`);

  const supabase = createAdminClient();
  const current = tests.filter((t) => t.componentIds.includes(componentId));
  const keepIds = new Set(rows.flatMap((row) => (row.id ? [row.id] : [])));
  try {
    for (const [i, row] of rows.entries()) {
      if (!row.id) continue;
      const existing = current.find((t) => t.id === row.id);
      if (!existing) throw new Error("A parameter no longer belongs to this component — reload and try again.");
      if (existing.officialName !== names[i]) {
        const { error } = await supabase.from("tests").update({ official_name: names[i], short_name: bracketed(names[i]) }).eq("id", row.id);
        if (error) throw error;
      }
    }
    // New parameters get a temporary code; every one of this component's own
    // parameters is then renumbered in list order (via temporary codes, so
    // two never hold the same code in between).
    const prefix = `${component.code}-`.toUpperCase();
    const stamp = Date.now();
    const owned: string[] = [];
    for (const [i, row] of rows.entries()) {
      if (row.id) {
        const existing = current.find((t) => t.id === row.id)!;
        if (existing.code.toUpperCase().startsWith(prefix)) owned.push(row.id);
        continue;
      }
      const { data, error } = await supabase
        .from("tests")
        .insert({
          code: `${component.code}-NEW-${stamp}-${i}`,
          official_name: names[i],
          short_name: bracketed(names[i]),
          category: categoryFor("parameter"),
        })
        .select("id")
        .single();
      if (error) throw error;
      const { error: linkError } = await supabase.from("test_components").insert({ parent_test_id: componentId, component_test_id: data.id });
      if (linkError) throw linkError;
      owned.push(data.id);
    }
    const codeById = new Map(current.map((t) => [t.id, t.code]));
    const finalCode = (index: number) => `${component.code}-${String(index + 1).padStart(2, "0")}`;
    const moving = owned.flatMap((id, index) => (codeById.get(id) === finalCode(index) ? [] : [{ id, code: finalCode(index) }]));
    for (const [i, { id }] of moving.entries()) {
      const { error } = await supabase.from("tests").update({ code: `${component.code}-TMP-${stamp}-${i}` }).eq("id", id);
      if (error) throw error;
    }
    for (const removed of current.filter((t) => !keepIds.has(t.id))) {
      if (removed.componentIds.length > 1) {
        const { error } = await supabase
          .from("test_components")
          .delete()
          .eq("parent_test_id", componentId)
          .eq("component_test_id", removed.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tests").delete().eq("id", removed.id);
        if (error) throw error;
      }
    }
    // Removed parameters are gone, so the final codes are free now.
    for (const { id, code } of moving) {
      const { error } = await supabase.from("tests").update({ code }).eq("id", id);
      if (error) throw error;
    }
  } finally {
    invalidateCatalogCache();
  }
}

/**
 * Replaces a calculated parameter's source tests. Sources are tests,
 * components or other calculated parameters — never a parameter, never
 * itself, and never a chain that loops back to it.
 */
export async function saveSources(calculatedId: string, sourceIds: string[]): Promise<void> {
  const tests = await listAllTests();
  const byId = new Map(tests.map((t) => [t.id, t]));
  const calc = byId.get(calculatedId);
  if (!calc || calc.testType !== "calculated") throw new Error("Not a calculated parameter.");
  const unique = [...new Set(sourceIds)];
  if (unique.length === 0) throw new Error("Pick at least one source test.");
  for (const id of unique) {
    const source = byId.get(id);
    if (!source) throw new Error("A source test no longer exists — reload and try again.");
    if (id === calculatedId) throw new Error("A calculated parameter can't be its own source.");
    if (source.testType === "parameter") throw new Error(`${source.officialName} is a parameter — pick its component instead.`);
    // Would this source (through its own sources) lead back here?
    const stack = [...source.sourceTestIds];
    const seen = new Set<string>();
    while (stack.length) {
      const next = stack.pop()!;
      if (next === calculatedId) throw new Error(`${source.officialName} is itself calculated from ${calc.officialName}.`);
      if (seen.has(next)) continue;
      seen.add(next);
      stack.push(...(byId.get(next)?.sourceTestIds ?? []));
    }
  }
  const supabase = createAdminClient();
  try {
    const { error: deleteError } = await supabase.from("test_components").delete().eq("parent_test_id", calculatedId);
    if (deleteError) throw deleteError;
    const { error } = await supabase
      .from("test_components")
      .insert(unique.map((id) => ({ parent_test_id: calculatedId, component_test_id: id })));
    if (error) throw error;
  } finally {
    invalidateCatalogCache();
  }
}

/**
 * A profile's guide figures per location + service type: the sum of its
 * measured tests' current prices and the slowest of their TATs (the
 * profile's TAT). Calculated parameters in the profile cost nothing and
 * don't count.
 */
export async function profileReferences(testIds: string[]): Promise<ProfileReference[]> {
  const tests = (await listAllTests()).filter((t) => testIds.includes(t.id));
  const measured = tests.filter((t) => t.testType === "test" || t.testType === "component");
  const prices = await currentPrices(measured.map((t) => t.id));
  const groups = new Map<string, PriceRow[]>();
  for (const row of prices) {
    const key = `${row.location_id}|${row.service_type}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()].map(([key, rows]) => {
    const [locationId, serviceType] = key.split("|") as [string, ServiceType];
    const pricedIds = new Set(rows.map((r) => r.test_id));
    const slowest = rows.reduce<PriceRow | null>((best, row) => {
      const hours = parseTatHours(row.tat_text);
      const bestHours = best ? parseTatHours(best.tat_text) : null;
      return hours !== null && (bestHours === null || hours > bestHours) ? row : best;
    }, null);
    return {
      locationId,
      serviceType,
      sum: rows.reduce((total, row) => total + row.price, 0),
      currencyCode: rows[0].currency_code,
      slowestTat: slowest?.tat_text ?? null,
      unpriced: measured.filter((t) => !pricedIds.has(t.id)).map((t) => t.officialName),
    };
  });
}
