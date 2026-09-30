import "server-only";
import ExcelJS from "exceljs";
import { listAllTests } from "@/lib/database/tests";
import { listAllAliasesWithTest } from "@/lib/database/aliases";
import { listCurrentPricesWithTestInfo } from "@/lib/database/prices";
import { listAllProfilesWithTestSelections, listCurrentProfilePricesWithProfileInfo } from "@/lib/database/profiles";
import { listActiveLocations } from "@/lib/database/locations";
import { getCurrencyFractionDigits } from "@/lib/pricing/money";
import { testTypeFromCategory } from "@/types/test";
import type { Location } from "@/types/location";

// Downloadable Excel files for the Master price list and Profiles uploads
// (lib/imports/test-details-import.ts, profile-details-import.ts), laid out
// like the master file (one row per item, a column pair per location).
// Either a template with example rows, or the current data in exactly the
// upload's format — so an admin can download, edit and re-upload.

interface ColumnSpec {
  header: string;
  key: string;
  width: number;
  help: string;
}

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

const MASTER_NOTES = [
  "Keep the first sheet and its header row as they are. Column order doesn't matter; extra columns (like \"sum of tests (reference)\") are ignored.",
  "All prices here are In-House. A blank price leaves that location as it is; write NA to mark it not available there (its current price is kept).",
  "After uploading you'll see a preview of every change. Nothing is saved until you confirm, and any error blocks the whole file.",
];

// The master file's location order; any other location follows.
const LOCATION_ORDER = ["dubai", "bahrain", "khobar", "riyadh"];
function inMasterOrder(locations: Location[]): Location[] {
  const rank = (l: Location) => {
    const i = LOCATION_ORDER.indexOf(l.name.toLowerCase());
    return i === -1 ? LOCATION_ORDER.length : i;
  };
  return [...locations].sort((a, b) => rank(a) - rank(b));
}

const exampleAmount = (location: Location, aed: number) => (location.currencyCode === "BHD" ? Number((aed / 10).toFixed(3)) : aed);
const toMajor = (amount: number, currencyCode: string) => {
  const digits = getCurrencyFractionDigits(currencyCode);
  return Number((amount / 10 ** digits).toFixed(digits));
};

/** In-House price + TAT cells per item id, keyed like the location columns. */
async function inHousePrices(
  locations: Location[],
  list: (location: Location) => Promise<{ id: string; price: number; tatText: string; availability: string }[]>
) {
  const byItem = new Map<string, Record<string, string | number>>();
  for (const location of locations) {
    for (const price of await list(location)) {
      const row = byItem.get(price.id) ?? {};
      row[`price:${location.id}`] = price.availability === "available" ? toMajor(price.price, location.currencyCode) : "NA";
      row[`tat:${location.id}`] = price.tatText;
      byItem.set(price.id, row);
    }
  }
  return byItem;
}

// Test details: the master file's Tests sheet — Test Code, Test Name, Alias
// Names, then "<Location> (TAT)" + "<Location> (B2C) <currency>" per location.
function testColumns(locations: Location[]): ColumnSpec[] {
  return [
    { header: "Test Code", key: "code", width: 14, help: "Required. The test's code (e.g. TSH). Matches an existing test, or creates a new one." },
    { header: "Test Name", key: "name", width: 40, help: "Required for a new test. Filled in = renames an existing test; blank = keep the current name." },
    { header: "Alias Names", key: "aliases", width: 40, help: "Optional. Other names customers use, separated by ; (e.g. ALT; SGPT). Only added, never removed." },
    ...locations.flatMap((location) => [
      { header: `${location.name} (TAT)`, key: `tat:${location.id}`, width: 14, help: `Turnaround time at ${location.name} (e.g. 4 hrs, 48 hrs).` },
      {
        header: `${location.name} (B2C) ${location.currencyCode}`,
        key: `price:${location.id}`,
        width: 18,
        help: `Price at ${location.name} in ${location.currencyCode} (e.g. ${exampleAmount(location, 7.3)}). Blank = leave as is; NA = not available there.`,
      },
    ]),
  ];
}

export async function buildTestDetailsWorkbook(filled: boolean): Promise<ExcelJS.Buffer> {
  const locations = inMasterOrder(await listActiveLocations());
  const columns = testColumns(locations);
  const notes = [
    "Same layout as the master file's Tests sheet: one row per test, with a TAT and a price column for each location.",
    ...MASTER_NOTES,
    "Parameters and calculated parameters aren't priced — manage them under Admin → Components and Calculated.",
  ];
  if (!filled) {
    const example = (code: string, name: string, aliases: string, aed: number, tat: string) => ({
      code,
      name,
      aliases,
      ...Object.fromEntries(locations.flatMap((l) => [[`tat:${l.id}`, tat], [`price:${l.id}`, exampleAmount(l, aed)]])),
    });
    return workbookWith("Tests", columns, [], notes, [
      example("SGPT", "Alanine Transaminase (SGPT)", "ALT; Alanine Aminotransferase", 7.3, "4 hrs"),
      example("TSH", "Thyroid Stimulating Hormone (TSH)", "Thyrotropin", 30, "48 hrs"),
    ]).xlsx.writeBuffer();
  }

  const [tests, aliases] = await Promise.all([listAllTests(), listAllAliasesWithTest()]);
  const aliasesByTest = new Map<string, string[]>();
  for (const alias of aliases) aliasesByTest.set(alias.testId, [...(aliasesByTest.get(alias.testId) ?? []), alias.alias]);
  const prices = await inHousePrices(locations, async (location) =>
    (await listCurrentPricesWithTestInfo({ locationId: location.id, serviceType: "in_house" })).map((p) => ({ ...p, id: p.testId }))
  );

  const rows = tests
    .filter((test) => prices.has(test.id) || (test.active && ["test", "component"].includes(testTypeFromCategory(test.category))))
    .sort((a, b) => a.officialName.localeCompare(b.officialName))
    .map((test) => ({
      code: test.code,
      name: test.officialName,
      aliases: (aliasesByTest.get(test.id) ?? []).sort().join("; "),
      ...prices.get(test.id),
    }));
  return workbookWith("Tests", columns, rows, notes).xlsx.writeBuffer();
}

// Profiles: the master's Profile Prices file — Profile Code, Profile Name,
// Test Codes, then "<Location> Price (<currency>)" + "<Location> TAT" per location.
function profileColumns(locations: Location[]): ColumnSpec[] {
  return [
    { header: "Profile Code", key: "code", width: 14, help: "Required. The package/profile code (e.g. LFT). Matches an existing one, or creates a new one." },
    { header: "Profile Name", key: "name", width: 36, help: "Required for a new profile. Blank = keep the current name." },
    {
      header: "Test Codes",
      key: "testCodes",
      width: 44,
      help: "The tests inside, by Test Code, separated by commas (e.g. CHOL, TRIG, HDL). This REPLACES the profile's test list; blank = keep the current list. Codes must already exist.",
    },
    ...locations.flatMap((location) => [
      {
        header: `${location.name} Price (${location.currencyCode})`,
        key: `price:${location.id}`,
        width: 18,
        help: `Fixed bundle price at ${location.name} in ${location.currencyCode}. Blank = leave as is.`,
      },
      { header: `${location.name} TAT`, key: `tat:${location.id}`, width: 13, help: `Turnaround time at ${location.name} (e.g. 4 hrs).` },
    ]),
  ];
}

export async function buildProfileWorkbook(filled: boolean): Promise<ExcelJS.Buffer> {
  const locations = inMasterOrder(await listActiveLocations());
  const columns = profileColumns(locations);
  const notes = [
    "Same layout as the Profile Prices file: one row per profile, with a price and a TAT column for each location.",
    ...MASTER_NOTES,
    "Test Codes replaces the whole test list of that profile — the preview shows any test that would be removed before you confirm.",
  ];
  if (!filled) {
    return workbookWith("Profile Prices", columns, [], notes, [
      {
        code: "LIPID",
        name: "Lipid Profile",
        testCodes: "CHOL, TRIG, HDL, LDL",
        ...Object.fromEntries(locations.flatMap((l) => [[`price:${l.id}`, exampleAmount(l, 45)], [`tat:${l.id}`, "4 hrs"]])),
      },
    ]).xlsx.writeBuffer();
  }

  const [profiles, tests] = await Promise.all([listAllProfilesWithTestSelections(), listAllTests()]);
  const codeById = new Map(tests.map((test) => [test.id, test.code]));
  const prices = await inHousePrices(locations, async (location) =>
    (await listCurrentProfilePricesWithProfileInfo({ locationId: location.id, serviceType: "in_house" })).map((p) => ({ ...p, id: p.profileId }))
  );
  const rows = profiles
    .filter(({ profile }) => profile.active)
    .sort((a, b) => a.profile.code.localeCompare(b.profile.code))
    .map(({ profile, tests: roster }) => ({
      code: profile.code,
      name: profile.name,
      testCodes: roster.map((t) => codeById.get(t.testId) ?? "").filter(Boolean).join(", "),
      ...prices.get(profile.id),
    }));
  return workbookWith("Profile Prices", columns, rows, notes).xlsx.writeBuffer();
}
