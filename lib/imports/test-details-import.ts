import "server-only";
import { readSheet } from "@/lib/excel/read-sheet";
import { createTest, listAllTests, setTestActive, updateTest } from "@/lib/database/tests";
import { createAlias, listAllAliasesWithTest } from "@/lib/database/aliases";
import { listCurrentPricesWithTestInfo } from "@/lib/database/prices";
import { listActiveLocations } from "@/lib/database/locations";
import {
  activatePriceListVersion,
  createPriceListVersion,
  insertStagingRows,
  updatePriceListVersion,
} from "@/lib/database/imports";
import { normalizeQuery } from "@/lib/search/normalize-query";
import { formatMajor, parsePrice, parseServiceType, parseYesNo, resolveLocation, splitList, type UploadIssue } from "./upload-values";
import { changeGroup, type UploadPreview } from "./upload-preview";
import type { Test } from "@/types/test";
import type { ServiceType } from "@/lib/constants/service-types";
import type { AvailabilityStatus } from "@/lib/constants/availability";
import type { ParsedPriceRow } from "@/types/import";

// Test details upload (Admin → Upload → "Test details"): one sheet that can
// create/update catalog tests, add search aliases, and set prices. One row
// per test per location + service type; a row with no Location only
// carries details. Blank detail cells keep the current value — the upload
// never blanks out data — and aliases are only ever added. Prices go
// through the same versioned pipeline as the price-list upload (one
// version per location + service type, activated by the
// activate_price_list_version Postgres function), so price history stays
// consistent.

export const TEST_DETAIL_HEADERS = {
  testCode: ["Test Code", "Code", "Test_Code"],
  testName: ["Test Name", "Name", "Official Name"],
  shortName: ["Short Name", "Abbreviation"],
  category: ["Category", "Department"],
  description: ["Description"],
  aliases: ["Aliases", "Alias", "Search Names", "Nicknames", "Other Names"],
  active: ["Active"],
  location: ["Location", "Branch"],
  serviceType: ["Service Type", "Type"],
  price: ["Price", "Rate", "Amount"],
  tat: ["TAT", "Turnaround", "Turnaround Time"],
  available: ["Available", "Availability"],
};
type Column = keyof typeof TEST_DETAIL_HEADERS;

/** Alias confidence for uploaded aliases — a hair below a hand-entered one (100). */
const UPLOADED_ALIAS_CONFIDENCE = 95;
const LARGE_PRICE_CHANGE = 0.2;

interface TestDetails {
  code: string;
  firstRow: number;
  name?: string;
  shortName?: string;
  category?: string;
  description?: string;
  active?: boolean;
  aliases: string[];
}

interface PlannedPrice {
  row: number;
  testCode: string;
  locationId: string;
  locationName: string;
  currencyCode: string;
  serviceType: ServiceType;
  price: number;
  tatText: string;
  availability: AvailabilityStatus;
  status: "new" | "changed" | "unchanged";
}

interface TestDetailsPlan {
  preview: UploadPreview;
  create: TestDetails[];
  update: { test: Test; details: TestDetails }[];
  activeChanges: { code: string; active: boolean }[];
  aliases: { code: string; alias: string }[];
  prices: PlannedPrice[];
}

async function plan(buffer: Buffer): Promise<TestDetailsPlan> {
  const [rows, tests, aliases, locations] = await Promise.all([
    readSheet<Column>(buffer, TEST_DETAIL_HEADERS, ["testCode"]),
    listAllTests(),
    listAllAliasesWithTest(),
    listActiveLocations(),
  ]);
  const errors: UploadIssue[] = [];
  const warnings: UploadIssue[] = [];
  const testByCode = new Map(tests.map((test) => [test.code.toUpperCase(), test]));

  // 1. Details, merged per test code (first non-blank value wins).
  const details = new Map<string, TestDetails>();
  const priceRows: { row: number; code: string; values: Partial<Record<Column, string>> }[] = [];
  for (const { rowNumber, values } of rows) {
    const code = values.testCode?.trim();
    if (!code) {
      errors.push({ row: rowNumber, message: "Test Code is required." });
      continue;
    }
    const key = code.toUpperCase();
    const entry = details.get(key) ?? { code, firstRow: rowNumber, aliases: [] };
    for (const field of ["name", "shortName", "category", "description"] as const) {
      const value = values[field === "name" ? "testName" : field];
      if (!value) continue;
      if (entry[field] === undefined) entry[field] = value;
      else if (entry[field] !== value) {
        warnings.push({ row: rowNumber, message: `${code}: different ${field} than row ${entry.firstRow} — using row ${entry.firstRow}'s.` });
      }
    }
    if (values.active) {
      const active = parseYesNo(values.active);
      if (active === null) errors.push({ row: rowNumber, message: `Active must be Yes or No (got "${values.active}").` });
      else entry.active ??= active;
    }
    entry.aliases.push(...splitList(values.aliases));
    details.set(key, entry);

    if (values.location || values.serviceType || values.price || values.tat || values.available) {
      priceRows.push({ row: rowNumber, code, values });
    }
  }

  // 2. Which tests are new, which change.
  const create: TestDetails[] = [];
  const update: { test: Test; details: TestDetails }[] = [];
  const activeChanges: { code: string; active: boolean }[] = [];
  const updateLines: string[] = [];
  for (const [key, entry] of details) {
    const existing = testByCode.get(key);
    if (!existing) {
      if (!entry.name) errors.push({ row: entry.firstRow, message: `${entry.code} is a new test — Test Name is required.` });
      else create.push(entry);
      continue;
    }
    const changed: string[] = [];
    if (entry.name && entry.name !== existing.officialName) changed.push(`name "${existing.officialName}" → "${entry.name}"`);
    if (entry.shortName && entry.shortName !== (existing.shortName ?? "")) changed.push(`short name → "${entry.shortName}"`);
    if (entry.category && entry.category !== (existing.category ?? "")) changed.push(`category → "${entry.category}"`);
    if (entry.description && entry.description !== (existing.description ?? "")) changed.push("description");
    if (changed.length > 0) {
      update.push({ test: existing, details: entry });
      updateLines.push(`${existing.code}: ${changed.join(", ")}`);
    }
    if (entry.active !== undefined && entry.active !== existing.active) {
      activeChanges.push({ code: existing.code, active: entry.active });
    }
  }

  // 3. Aliases: only new ones; never one that already names another test.
  const nameOwners = new Map<string, Set<string>>();
  const claim = (text: string | null | undefined, code: string) => {
    const key = text ? normalizeQuery(text).replace(/\s+/g, "") : "";
    if (!key) return;
    const owners = nameOwners.get(key) ?? new Set<string>();
    owners.add(code.toUpperCase());
    nameOwners.set(key, owners);
  };
  for (const test of tests) {
    claim(test.code, test.code);
    claim(test.officialName, test.code);
    claim(test.shortName, test.code);
  }
  for (const alias of aliases) claim(alias.alias, alias.testCode);
  for (const entry of create) {
    claim(entry.code, entry.code);
    claim(entry.name, entry.code);
    claim(entry.shortName, entry.code);
  }

  const plannedAliases: { code: string; alias: string }[] = [];
  let aliasesAlreadyThere = 0;
  for (const [key, entry] of details) {
    if (!testByCode.has(key) && !create.includes(entry)) continue;
    for (const alias of entry.aliases) {
      const aliasKey = normalizeQuery(alias).replace(/\s+/g, "");
      if (!aliasKey) continue;
      const owners = nameOwners.get(aliasKey);
      if (owners?.has(key)) {
        aliasesAlreadyThere++;
        continue;
      }
      if (owners && owners.size > 0) {
        warnings.push({ row: entry.firstRow, message: `Alias "${alias}" skipped for ${entry.code} — it already names ${[...owners].join(", ")}.` });
        continue;
      }
      claim(alias, entry.code);
      plannedAliases.push({ code: entry.code, alias });
    }
  }

  // 4. Prices, validated and compared with the current price at that location + service type.
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
      errors.push({ row, message: `${code}: ${location.name} ${serviceType === "in_house" ? "In-House" : "Outsource"} price is already on row ${seen.get(dupKey)}.` });
      continue;
    }
    seen.set(dupKey, row);
    prices.push({
      row,
      testCode: testByCode.get(code.toUpperCase())?.code ?? code,
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
      (await listCurrentPricesWithTestInfo({ locationId, serviceType })).map((p) => [p.testCode.toUpperCase(), p])
    );
    for (const p of prices.filter((x) => x.locationId === locationId && x.serviceType === serviceType)) {
      const now = current.get(p.testCode.toUpperCase());
      const label = `${p.testCode} · ${p.locationName} ${p.serviceType === "in_house" ? "In-House" : "Outsource"}`;
      if (!now) {
        p.status = "new";
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

  const toApply = create.length + update.length + activeChanges.length + plannedAliases.length + priceLines.new.length + priceLines.changed.length;
  return {
    create,
    update,
    activeChanges,
    aliases: plannedAliases,
    prices,
    preview: {
      errors,
      warnings,
      stats: [
        { label: "Rows read", value: rows.length },
        { label: "New tests", value: create.length },
        { label: "Tests updated", value: update.length + activeChanges.length },
        { label: "New aliases", value: plannedAliases.length },
        { label: "New prices", value: priceLines.new.length },
        { label: "Price/TAT changes", value: priceLines.changed.length },
        { label: "Unchanged", value: priceLines.unchanged.length + aliasesAlreadyThere },
      ],
      changes: [
        changeGroup("New tests", create.map((entry) => `${entry.code} — ${entry.name}`)),
        changeGroup("Test details updated", updateLines),
        changeGroup("Activated / deactivated", activeChanges.map((c) => `${c.code} → ${c.active ? "Active" : "Inactive"}`)),
        changeGroup("New aliases", plannedAliases.map((a) => `${a.alias} → ${a.code}`)),
        changeGroup("New prices", priceLines.new),
        changeGroup("Price / TAT / availability changes", priceLines.changed),
      ].filter((group) => group.total > 0),
      canApply: errors.length === 0 && toApply > 0,
    },
  };
}

export async function previewTestDetailsUpload(buffer: Buffer): Promise<UploadPreview> {
  return (await plan(buffer)).preview;
}

/**
 * Re-plans the same file (stateless — nothing is kept between preview and
 * apply) and applies it. Refuses if the file has any error.
 */
export async function applyTestDetailsUpload(
  buffer: Buffer,
  meta: { filename: string; fileSize: number; userId: string }
): Promise<UploadPreview> {
  const result = await plan(buffer);
  if (!result.preview.canApply) return result.preview;

  for (const entry of result.create) {
    await createTest({
      code: entry.code,
      officialName: entry.name!,
      shortName: entry.shortName ?? null,
      category: entry.category ?? null,
      description: entry.description ?? null,
    });
  }
  for (const { test, details } of result.update) {
    await updateTest(test.id, {
      code: test.code,
      officialName: details.name ?? test.officialName,
      shortName: details.shortName ?? test.shortName,
      category: details.category ?? test.category,
      description: details.description ?? test.description,
    });
  }
  const tests = await listAllTests();
  const idByCode = new Map(tests.map((test) => [test.code.toUpperCase(), test.id]));
  for (const change of result.activeChanges) {
    const id = idByCode.get(change.code.toUpperCase());
    if (id) await setTestActive(id, change.active);
  }
  for (const { code, alias } of result.aliases) {
    const testId = idByCode.get(code.toUpperCase());
    if (!testId) continue;
    try {
      await createAlias({
        testId,
        alias,
        normalizedAlias: normalizeQuery(alias),
        aliasType: !/\s/.test(alias) && alias.length <= 10 ? "abbreviation" : "customer_term",
        confidence: UPLOADED_ALIAS_CONFIDENCE,
      });
    } catch {
      // Already there (unique test+alias) — nothing to add.
    }
  }

  // Prices: one versioned import per location + service type, new/changed rows only.
  const nameByCode = new Map(tests.map((test) => [test.code.toUpperCase(), test]));
  const byGroup = new Map<string, PlannedPrice[]>();
  for (const price of result.prices.filter((p) => p.status !== "unchanged")) {
    const key = `${price.locationId}|${price.serviceType}`;
    byGroup.set(key, [...(byGroup.get(key) ?? []), price]);
  }
  for (const group of byGroup.values()) {
    const { locationId, serviceType } = group[0];
    const version = await createPriceListVersion({
      locationId,
      serviceType,
      originalFilename: meta.filename,
      fileSize: meta.fileSize,
      createdBy: meta.userId,
    });
    await insertStagingRows(
      version.id,
      group.map((price) => {
        const test = nameByCode.get(price.testCode.toUpperCase());
        const parsed: ParsedPriceRow = {
          rowNumber: price.row,
          testCode: test?.code ?? price.testCode,
          testName: test?.officialName ?? price.testCode,
          category: test?.category ?? null,
          price: price.price,
          tatText: price.tatText,
          availability: price.availability,
          notes: null,
          isNewTest: false,
        };
        return { rowNumber: price.row, rawRow: { source: "test-details-upload" }, parsed, rowStatus: "ok" as const, errorMessages: [] };
      })
    );
    await updatePriceListVersion(version.id, {
      status: "validated",
      recordCount: group.length,
      validatedAt: new Date().toISOString(),
    });
    await activatePriceListVersion(version.id, meta.userId);
  }

  return result.preview;
}
