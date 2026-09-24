import "server-only";
import { readSheet } from "@/lib/excel/read-sheet";
import { listAllTests } from "@/lib/database/tests";
import { listActiveLocations } from "@/lib/database/locations";
import {
  createProfile,
  listAllProfilesWithTestSelections,
  listCurrentProfilePricesWithProfileInfo,
  setProfileTests,
  updateProfile,
  upsertProfilePrice,
} from "@/lib/database/profiles";
import { formatMajor, parsePrice, parseServiceType, parseYesNo, resolveLocation, splitList, type UploadIssue } from "./upload-values";
import { changeGroup, type UploadPreview } from "./upload-preview";
import type { Profile } from "@/types/profile";
import type { ServiceType } from "@/lib/constants/service-types";
import type { AvailabilityStatus } from "@/lib/constants/availability";

// Profile/package upload (Admin → Upload → "Profiles & packages"): one row
// per profile per location + service type. Creates missing profiles,
// updates names/descriptions, sets each profile's test list from its
// "Test Codes" cell (the preview lists any test that would be removed), and
// sets the bundle price at each location — the same direct, admin-managed
// pricing the Admin → Profiles form uses (upsertProfilePrice). Blank cells
// keep the current value; a profile's test list is only touched when its
// Test Codes cell is filled.

export const PROFILE_DETAIL_HEADERS = {
  profileCode: ["Profile Code", "Package Code", "Code"],
  profileName: ["Profile Name", "Package Name", "Name"],
  description: ["Description"],
  testCodes: ["Test Codes", "Tests", "Test Code", "Components", "Parameters"],
  location: ["Location", "Branch"],
  serviceType: ["Service Type", "Type"],
  price: ["Price", "Rate", "Amount"],
  tat: ["TAT", "Turnaround", "Turnaround Time"],
  available: ["Available", "Availability"],
};
type Column = keyof typeof PROFILE_DETAIL_HEADERS;

const LARGE_PRICE_CHANGE = 0.2;

interface ProfileDetails {
  code: string;
  firstRow: number;
  name?: string;
  description?: string;
  /** Test codes as written, from the first row that lists them; undefined = leave the roster alone. */
  testCodes?: string[];
  testCodesRow?: number;
}

interface PlannedPrice {
  row: number;
  profileCode: string;
  locationId: string;
  locationName: string;
  currencyCode: string;
  serviceType: ServiceType;
  price: number;
  tatText: string;
  availability: AvailabilityStatus;
  status: "new" | "changed" | "unchanged";
}

interface ProfilePlan {
  preview: UploadPreview;
  create: ProfileDetails[];
  update: { profile: Profile; name: string; description: string | null }[];
  rosters: { code: string; tests: { testId: string; required: boolean }[] }[];
  prices: PlannedPrice[];
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((value) => b.includes(value));

async function plan(buffer: Buffer): Promise<ProfilePlan> {
  const [rows, tests, profiles, locations] = await Promise.all([
    readSheet<Column>(buffer, PROFILE_DETAIL_HEADERS, ["profileCode"]),
    listAllTests(),
    listAllProfilesWithTestSelections(),
    listActiveLocations(),
  ]);
  const errors: UploadIssue[] = [];
  const warnings: UploadIssue[] = [];
  const testByCode = new Map(tests.map((test) => [test.code.toUpperCase(), test]));
  const testById = new Map(tests.map((test) => [test.id, test]));
  const profileByCode = new Map(profiles.map((entry) => [entry.profile.code.toUpperCase(), entry]));

  // 1. Profile details, merged per profile code.
  const details = new Map<string, ProfileDetails>();
  const priceRows: { row: number; code: string; values: Partial<Record<Column, string>> }[] = [];
  for (const { rowNumber, values } of rows) {
    const code = values.profileCode?.trim();
    if (!code) {
      errors.push({ row: rowNumber, message: "Profile Code is required." });
      continue;
    }
    const key = code.toUpperCase();
    const entry = details.get(key) ?? { code, firstRow: rowNumber };
    if (values.profileName) {
      if (entry.name === undefined) entry.name = values.profileName;
      else if (entry.name !== values.profileName) {
        warnings.push({ row: rowNumber, message: `${code}: different Profile Name than row ${entry.firstRow} — using row ${entry.firstRow}'s.` });
      }
    }
    if (values.description && entry.description === undefined) entry.description = values.description;
    if (values.testCodes) {
      const codes = splitList(values.testCodes).map((c) => c.toUpperCase());
      if (entry.testCodes === undefined) {
        entry.testCodes = codes;
        entry.testCodesRow = rowNumber;
      } else if (!sameList(entry.testCodes, codes)) {
        errors.push({ row: rowNumber, message: `${code}: Test Codes differ from row ${entry.testCodesRow} — list them the same on every row, or only on one.` });
      }
    }
    details.set(key, entry);
    if (values.location || values.serviceType || values.price || values.tat || values.available) {
      priceRows.push({ row: rowNumber, code, values });
    }
  }

  // 2. New / renamed profiles and test-list changes.
  const create: ProfileDetails[] = [];
  const update: ProfilePlan["update"] = [];
  const rosters: ProfilePlan["rosters"] = [];
  const updateLines: string[] = [];
  const rosterLines: string[] = [];
  for (const [key, entry] of details) {
    const existing = profileByCode.get(key);
    if (!existing) {
      if (!entry.name) errors.push({ row: entry.firstRow, message: `${entry.code} is a new profile — Profile Name is required.` });
      else create.push(entry);
      if (!entry.testCodes) warnings.push({ row: entry.firstRow, message: `${entry.code} is new but lists no Test Codes — it will have no tests.` });
    } else {
      const name = entry.name ?? existing.profile.name;
      const description = entry.description ?? existing.profile.description;
      if (name !== existing.profile.name || description !== existing.profile.description) {
        update.push({ profile: existing.profile, name, description });
        updateLines.push(
          name !== existing.profile.name ? `${existing.profile.code}: "${existing.profile.name}" → "${name}"` : `${existing.profile.code}: description`
        );
      }
    }

    if (entry.testCodes) {
      const unknown = entry.testCodes.filter((code) => !testByCode.has(code));
      if (unknown.length > 0) {
        errors.push({ row: entry.testCodesRow!, message: `${entry.code}: unknown test code(s) ${unknown.join(", ")} — add them via the Test details upload first.` });
        continue;
      }
      const inactive = entry.testCodes.filter((code) => testByCode.get(code)?.active === false);
      if (inactive.length > 0) warnings.push({ row: entry.testCodesRow!, message: `${entry.code}: includes inactive test(s) ${inactive.join(", ")}.` });

      const wanted = entry.testCodes.map((code) => testByCode.get(code)!.id);
      const current = existing?.tests ?? [];
      const currentIds = current.map((t) => t.testId);
      const added = wanted.filter((id) => !currentIds.includes(id));
      const removed = currentIds.filter((id) => !wanted.includes(id));
      if (added.length > 0 || removed.length > 0) {
        const requiredById = new Map(current.map((t) => [t.testId, t.required]));
        rosters.push({ code: entry.code, tests: wanted.map((testId) => ({ testId, required: requiredById.get(testId) ?? true })) });
        const codesOf = (ids: string[]) => ids.map((id) => testById.get(id)?.code ?? id).join(", ");
        rosterLines.push(
          `${entry.code}: ${[added.length ? `+ ${codesOf(added)}` : "", removed.length ? `− ${codesOf(removed)}` : ""].filter(Boolean).join("  ")}`
        );
        if (removed.length > 0 && existing) {
          warnings.push({ row: entry.testCodesRow!, message: `${entry.code}: ${removed.length} test(s) will be removed from the package (${codesOf(removed)}).` });
        }
      }
    }
  }

  // 3. Bundle prices.
  const prices: PlannedPrice[] = [];
  const seen = new Map<string, number>();
  for (const { row, code, values } of priceRows) {
    const location = values.location ? resolveLocation(values.location, locations) : null;
    const serviceType = values.serviceType ? parseServiceType(values.serviceType) : null;
    const rowErrors: string[] = [];
    if (!values.location) rowErrors.push("Location is required when a price is given");
    else if (!location) rowErrors.push(`unknown Location "${values.location}" (use ${locations.map((l) => l.name).join(", ")})`);
    if (!values.serviceType) rowErrors.push("Service Type is required when a price is given");
    else if (!serviceType) rowErrors.push(`Service Type must be In-House or Outsource (got "${values.serviceType}")`);
    const price = values.price && location ? parsePrice(values.price, location.currencyCode) : null;
    if (!values.price) rowErrors.push("Price is required when a Location is given");
    else if (location && price === null) rowErrors.push(`Price "${values.price}" isn't a valid amount`);
    if (!values.tat) rowErrors.push("TAT is required when a price is given");
    const available = values.available ? parseYesNo(values.available) : true;
    if (available === null) rowErrors.push(`Available must be Yes or No (got "${values.available}")`);
    if (rowErrors.length > 0 || !location || !serviceType || price === null) {
      errors.push({ row, message: `${code}: ${rowErrors.join("; ")}.` });
      continue;
    }
    const dupKey = `${code.toUpperCase()}|${location.id}|${serviceType}`;
    if (seen.has(dupKey)) {
      errors.push({ row, message: `${code}: ${location.name} price is already on row ${seen.get(dupKey)}.` });
      continue;
    }
    seen.set(dupKey, row);
    prices.push({
      row,
      profileCode: profileByCode.get(code.toUpperCase())?.profile.code ?? code,
      locationId: location.id,
      locationName: location.name,
      currencyCode: location.currencyCode,
      serviceType,
      price,
      tatText: values.tat!,
      availability: available ? "available" : "unavailable",
      status: "new",
    });
  }

  const priceLines: Record<PlannedPrice["status"], string[]> = { new: [], changed: [], unchanged: [] };
  const groups = new Set(prices.map((p) => `${p.locationId}|${p.serviceType}`));
  for (const group of groups) {
    const [locationId, serviceType] = group.split("|") as [string, ServiceType];
    const current = new Map(
      (await listCurrentProfilePricesWithProfileInfo({ locationId, serviceType })).map((p) => [p.profileCode.toUpperCase(), p])
    );
    for (const p of prices.filter((x) => x.locationId === locationId && x.serviceType === serviceType)) {
      const now = current.get(p.profileCode.toUpperCase());
      const label = `${p.profileCode} · ${p.locationName} ${p.serviceType === "in_house" ? "In-House" : "Outsource"}`;
      if (!now) {
        priceLines.new.push(`${label}: ${formatMajor(p.price, p.currencyCode)}`);
      } else if (now.price !== p.price || now.tatText !== p.tatText || now.availability !== p.availability) {
        p.status = "changed";
        const parts = [
          now.price !== p.price ? `${formatMajor(now.price, p.currencyCode)} → ${formatMajor(p.price, p.currencyCode)}` : "",
          now.tatText !== p.tatText ? `TAT "${now.tatText}" → "${p.tatText}"` : "",
          now.availability !== p.availability ? `${now.availability.replace(/_/g, " ")} → ${p.availability}` : "",
        ].filter(Boolean);
        priceLines.changed.push(`${label}: ${parts.join(", ")}`);
        if (now.price > 0 && Math.abs(p.price - now.price) / now.price > LARGE_PRICE_CHANGE) {
          warnings.push({ row: p.row, message: `${label}: price changes by ${Math.round(((p.price - now.price) / now.price) * 100)}%.` });
        }
      } else {
        p.status = "unchanged";
        priceLines.unchanged.push(label);
      }
      if (p.price === 0) warnings.push({ row: p.row, message: `${label}: price is 0 — it would be quoted as free.` });
    }
  }

  const toApply = create.length + update.length + rosters.length + priceLines.new.length + priceLines.changed.length;
  return {
    create,
    update,
    rosters,
    prices,
    preview: {
      errors,
      warnings,
      stats: [
        { label: "Rows read", value: rows.length },
        { label: "New profiles", value: create.length },
        { label: "Profiles updated", value: update.length },
        { label: "Test lists changed", value: rosters.length },
        { label: "New prices", value: priceLines.new.length },
        { label: "Price/TAT changes", value: priceLines.changed.length },
        { label: "Unchanged prices", value: priceLines.unchanged.length },
      ],
      changes: [
        changeGroup("New profiles", create.map((entry) => `${entry.code} — ${entry.name} (${entry.testCodes?.length ?? 0} tests)`)),
        changeGroup("Profile details updated", updateLines),
        changeGroup("Test list changes", rosterLines),
        changeGroup("New prices", priceLines.new),
        changeGroup("Price / TAT / availability changes", priceLines.changed),
      ].filter((group) => group.total > 0),
      canApply: errors.length === 0 && toApply > 0,
    },
  };
}

export async function previewProfileUpload(buffer: Buffer): Promise<UploadPreview> {
  return (await plan(buffer)).preview;
}

/** Re-plans the same file (stateless) and applies it; refuses if the file has any error. */
export async function applyProfileUpload(buffer: Buffer): Promise<UploadPreview> {
  const result = await plan(buffer);
  if (!result.preview.canApply) return result.preview;

  const idByCode = new Map<string, string>();
  for (const { profile } of await listAllProfilesWithTestSelections()) idByCode.set(profile.code.toUpperCase(), profile.id);

  for (const entry of result.create) {
    const created = await createProfile({ code: entry.code, name: entry.name!, description: entry.description ?? null });
    idByCode.set(created.code.toUpperCase(), created.id);
  }
  for (const { profile, name, description } of result.update) {
    await updateProfile(profile.id, { code: profile.code, name, description });
  }
  for (const roster of result.rosters) {
    const profileId = idByCode.get(roster.code.toUpperCase());
    if (profileId) await setProfileTests(profileId, roster.tests);
  }
  for (const price of result.prices.filter((p) => p.status !== "unchanged")) {
    const profileId = idByCode.get(price.profileCode.toUpperCase());
    if (!profileId) continue;
    await upsertProfilePrice({
      profileId,
      locationId: price.locationId,
      serviceType: price.serviceType,
      price: price.price,
      currencyCode: price.currencyCode,
      tatText: price.tatText,
      availability: price.availability,
    });
  }
  return result.preview;
}
