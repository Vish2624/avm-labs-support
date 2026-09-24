import "server-only";
import ExcelJS from "exceljs";
import { listAllTests } from "@/lib/database/tests";
import { listAllAliasesWithTest } from "@/lib/database/aliases";
import { listCurrentPricesWithTestInfo } from "@/lib/database/prices";
import { listAllProfilesWithTestSelections, listCurrentProfilePricesWithProfileInfo } from "@/lib/database/profiles";
import { listActiveLocations } from "@/lib/database/locations";
import { getCurrencyFractionDigits } from "@/lib/pricing/money";
import { SERVICE_TYPES, type ServiceType } from "@/lib/constants/service-types";

// Downloadable Excel files for the Test details and Profiles uploads
// (lib/imports/test-details-import.ts, profile-details-import.ts). Either a
// template with example rows, or the current data in exactly the upload's
// format — so an admin can download, edit and re-upload.

const SERVICE_LABEL: Record<ServiceType, string> = { in_house: "In-House", outsource: "Outsource" };

interface ColumnSpec {
  header: string;
  key: string;
  width: number;
  help: string;
}

const TEST_COLUMNS: ColumnSpec[] = [
  { header: "Test Code", key: "code", width: 14, help: "Required. The test's code (e.g. TSH). Matches an existing test, or creates a new one." },
  { header: "Test Name", key: "name", width: 36, help: "Required for a new test. Filled in = renames an existing test; blank = keep the current name." },
  { header: "Short Name", key: "shortName", width: 14, help: "Optional. Blank = keep current." },
  { header: "Category", key: "category", width: 16, help: "Optional (e.g. Thyroid, Diabetes). Blank = keep current." },
  { header: "Description", key: "description", width: 30, help: "Optional. Blank = keep current." },
  { header: "Aliases", key: "aliases", width: 40, help: "Optional. Other names customers use, separated by ; (e.g. Vit D; Vitamin D Total). Only added, never removed." },
  { header: "Active", key: "active", width: 9, help: "Optional. Yes or No. Blank = keep current." },
  { header: "Location", key: "location", width: 11, help: "For a price: Dubai, Bahrain, Khobar or Riyadh. Leave the price columns blank on a details-only row." },
  { header: "Service Type", key: "serviceType", width: 13, help: "For a price: In-House or Outsource." },
  { header: "Price", key: "price", width: 11, help: "For a price: amount in that location's currency (e.g. 45.50 AED, 4.600 BHD)." },
  { header: "TAT", key: "tat", width: 16, help: "For a price: turnaround time as agents should read it (e.g. 8 hours, 3 working days)." },
  { header: "Available", key: "available", width: 10, help: "For a price: Yes or No. Blank = Yes." },
];

const PROFILE_COLUMNS: ColumnSpec[] = [
  { header: "Profile Code", key: "code", width: 14, help: "Required. The package/profile code (e.g. LIPID). Matches an existing one, or creates a new one." },
  { header: "Profile Name", key: "name", width: 36, help: "Required for a new profile. Blank = keep the current name." },
  { header: "Description", key: "description", width: 30, help: "Optional. Blank = keep current." },
  { header: "Test Codes", key: "testCodes", width: 44, help: "The tests inside, by Test Code, separated by commas (e.g. CHOL, TRIG, HDL, LDL). This REPLACES the profile's test list; blank = keep the current list. Codes must already exist (add new tests with the Test details upload first)." },
  { header: "Location", key: "location", width: 11, help: "Dubai, Bahrain, Khobar or Riyadh. One row per profile per location + service type." },
  { header: "Service Type", key: "serviceType", width: 13, help: "In-House or Outsource." },
  { header: "Price", key: "price", width: 11, help: "Bundle price in that location's currency (e.g. 45.00 AED, 4.600 BHD)." },
  { header: "TAT", key: "tat", width: 16, help: "Turnaround time (e.g. 8 hours, 24-48 hrs)." },
  { header: "Available", key: "available", width: 10, help: "Yes or No. Blank = Yes." },
];

function workbookWith(
  sheetName: string,
  columns: ColumnSpec[],
  rows: Record<string, string | number>[],
  notes: string[],
  examples: Record<string, string | number>[] = []
) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = columns.map(({ header, key, width }) => ({ header, key, width }));
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F5BB7" } };
  header.height = 20;
  for (const row of rows) sheet.addRow(row);

  const help = workbook.addWorksheet("How to fill");
  help.columns = [
    { header: "Column", key: "column", width: 16 },
    { header: "What to put", key: "help", width: 110 },
  ];
  help.getRow(1).font = { bold: true };
  for (const column of columns) help.addRow({ column: column.header, help: column.help });
  help.addRow({});
  for (const note of notes) help.addRow({ column: "", help: note });
  help.getColumn("help").alignment = { wrapText: true, vertical: "top" };

  // Examples live here, not on the upload sheet, so uploading an untouched
  // template can never change real data.
  if (examples.length > 0) {
    help.addRow([]);
    help.addRow(["EXAMPLE", `How rows on the "${sheetName}" sheet look (illustrative codes and prices):`]).font = { bold: true };
    help.addRow(columns.map((column) => column.header)).font = { italic: true };
    for (const row of examples) help.addRow(columns.map((column) => row[column.key] ?? ""));
  }
  return workbook;
}

const PRICE_COLUMNS: ColumnSpec[] = [
  { header: "Test Code", key: "code", width: 14, help: "Required. The test's code (e.g. TSH). A code not in the catalog creates a new test on activation." },
  { header: "Test Name", key: "name", width: 36, help: "Required. Used as the name only when the code is a new test; an existing test keeps its name." },
  { header: "Category", key: "category", width: 16, help: "Optional (e.g. Thyroid)." },
  { header: "Price", key: "price", width: 11, help: "Required. Amount in the location's currency (e.g. 45.50 for AED, 4.600 for BHD)." },
  { header: "TAT", key: "tat", width: 16, help: "Required. Turnaround time as agents should read it (e.g. 8 hours, 3 working days)." },
  { header: "Service Type", key: "serviceType", width: 13, help: "Required. In-House or Outsource — and it must match the service type picked on the upload screen." },
  { header: "Available", key: "available", width: 10, help: "Required. Yes or No." },
  { header: "Notes", key: "notes", width: 24, help: "Optional. Not shown to agents." },
];

/**
 * Template for the Price list upload: one location + service type per file,
 * picked on the upload screen. Only rows in the file change; tests not in
 * the file keep their current price.
 */
export async function buildPriceListTemplate(): Promise<ExcelJS.Buffer> {
  return workbookWith(
    "Prices",
    PRICE_COLUMNS,
    [],
    [
      "One file = one location + one service type. Pick both on the upload screen before choosing the file.",
      "Only the tests in the file are updated; every other test keeps its current price.",
      "Keep the header row as it is. Column order doesn't matter; extra columns are ignored.",
      "After uploading you'll see a validation report and a preview of every change. Nothing goes live until you click Activate.",
      "Tip: \"Download current price list\" gives this location's live prices in this exact format, ready to edit and re-upload.",
    ],
    [
      { code: "TSH", name: "THYROID STIMULATING HORMONE (TSH)", category: "Thyroid", price: 92, tat: "8 hours", serviceType: "In-House", available: "Yes" },
      { code: "VITDC", name: "25-OH VITAMIN D (TOTAL)", category: "Vitamins", price: 54.7, tat: "8 hours", serviceType: "In-House", available: "Yes" },
    ]
  ).xlsx.writeBuffer();
}

const COMMON_NOTES = [
  "Keep the first sheet and its header row as they are. Column order doesn't matter; extra columns are ignored.",
  "One row per item per location + service type. Repeat the code on each row; details only need filling on one of them.",
  "After uploading you'll see a preview of every change. Nothing is saved until you confirm, and any error blocks the whole file.",
];

export async function buildTestDetailsWorkbook(filled: boolean): Promise<ExcelJS.Buffer> {
  const notes = [
    ...COMMON_NOTES,
    "A row with no Location only updates the test's details. Prices are saved as a new price-list version per location + service type, like the Price list upload.",
  ];
  if (!filled) {
    return workbookWith(
      "Tests",
      TEST_COLUMNS,
      [],
      notes,
      [
        { code: "TSH", name: "THYROID STIMULATING HORMONE (TSH)", shortName: "TSH", category: "Thyroid", aliases: "Thyrotropin; Thyroid test", active: "Yes", location: "Dubai", serviceType: "In-House", price: 92, tat: "8 hours", available: "Yes" },
        { code: "TSH", location: "Bahrain", serviceType: "In-House", price: 0.95, tat: "8 hours", available: "Yes" },
        { code: "VITDC", name: "25-OH VITAMIN D (TOTAL)", category: "Vitamins", aliases: "Vitamin D; Vit D; Vit D Total", active: "Yes" },
      ]
    ).xlsx.writeBuffer();
  }

  const [tests, aliases, locations] = await Promise.all([listAllTests(), listAllAliasesWithTest(), listActiveLocations()]);
  const aliasesByTest = new Map<string, string[]>();
  for (const alias of aliases) aliasesByTest.set(alias.testId, [...(aliasesByTest.get(alias.testId) ?? []), alias.alias]);

  const priceRows = new Map<string, Record<string, string | number>[]>();
  for (const location of locations) {
    const digits = getCurrencyFractionDigits(location.currencyCode);
    for (const serviceType of SERVICE_TYPES) {
      for (const price of await listCurrentPricesWithTestInfo({ locationId: location.id, serviceType })) {
        const list = priceRows.get(price.testId) ?? [];
        list.push({
          location: location.name,
          serviceType: SERVICE_LABEL[serviceType],
          price: Number((price.price / 10 ** digits).toFixed(digits)),
          tat: price.tatText,
          available: price.availability === "available" ? "Yes" : "No",
        });
        priceRows.set(price.testId, list);
      }
    }
  }

  const rows: Record<string, string | number>[] = [];
  for (const test of [...tests].sort((a, b) => a.code.localeCompare(b.code))) {
    const details = {
      code: test.code,
      name: test.officialName,
      shortName: test.shortName ?? "",
      category: test.category ?? "",
      description: test.description ?? "",
      aliases: (aliasesByTest.get(test.id) ?? []).sort().join("; "),
      active: test.active ? "Yes" : "No",
    };
    const prices = priceRows.get(test.id) ?? [];
    if (prices.length === 0) rows.push(details);
    prices.forEach((price, i) => rows.push(i === 0 ? { ...details, ...price } : { code: test.code, ...price }));
  }
  return workbookWith("Tests", TEST_COLUMNS, rows, notes).xlsx.writeBuffer();
}

export async function buildProfileWorkbook(filled: boolean): Promise<ExcelJS.Buffer> {
  const notes = [
    ...COMMON_NOTES,
    "Test Codes replaces the whole test list of that profile — the preview shows any test that would be removed before you confirm.",
  ];
  if (!filled) {
    return workbookWith(
      "Profiles",
      PROFILE_COLUMNS,
      [],
      notes,
      [
        { code: "LIPID", name: "LIPID PROFILE", testCodes: "CHOL, TRIG, HDL, LDL", location: "Dubai", serviceType: "In-House", price: 45, tat: "8 hours", available: "Yes" },
        { code: "LIPID", location: "Bahrain", serviceType: "In-House", price: 4.6, tat: "8 hours", available: "Yes" },
        { code: "TFT", name: "TOTAL THYROID", testCodes: "T3, T4, TSH", location: "Dubai", serviceType: "In-House", price: 60, tat: "8 hours", available: "Yes" },
      ]
    ).xlsx.writeBuffer();
  }

  const [profiles, tests, locations] = await Promise.all([listAllProfilesWithTestSelections(), listAllTests(), listActiveLocations()]);
  const codeById = new Map(tests.map((test) => [test.id, test.code]));
  const priceRows = new Map<string, Record<string, string | number>[]>();
  for (const location of locations) {
    const digits = getCurrencyFractionDigits(location.currencyCode);
    for (const serviceType of SERVICE_TYPES) {
      for (const price of await listCurrentProfilePricesWithProfileInfo({ locationId: location.id, serviceType })) {
        const list = priceRows.get(price.profileId) ?? [];
        list.push({
          location: location.name,
          serviceType: SERVICE_LABEL[serviceType],
          price: Number((price.price / 10 ** digits).toFixed(digits)),
          tat: price.tatText,
          available: price.availability === "available" ? "Yes" : "No",
        });
        priceRows.set(price.profileId, list);
      }
    }
  }

  const rows: Record<string, string | number>[] = [];
  for (const { profile, tests: roster } of [...profiles].sort((a, b) => a.profile.code.localeCompare(b.profile.code))) {
    if (!profile.active) continue;
    const details = {
      code: profile.code,
      name: profile.name,
      description: profile.description ?? "",
      testCodes: roster.map((t) => codeById.get(t.testId) ?? "").filter(Boolean).join(", "),
    };
    const prices = priceRows.get(profile.id) ?? [];
    if (prices.length === 0) rows.push(details);
    prices.forEach((price, i) => rows.push(i === 0 ? { ...details, ...price } : { code: profile.code, ...price }));
  }
  return workbookWith("Profiles", PROFILE_COLUMNS, rows, notes).xlsx.writeBuffer();
}
