import "server-only";
import ExcelJS from "exceljs";
import { ExcelParseError } from "./parse-excel";

export interface SheetRow<Key extends string> {
  /** 1-based Excel row number, for messages. */
  rowNumber: number;
  values: Partial<Record<Key, string>>;
}

/**
 * Reads the first worksheet of an uploaded .xlsx into rows keyed by
 * canonical column names. Headers (row 1) are matched case-, space- and
 * punctuation-insensitively against `headers` (each key lists the header
 * spellings it accepts), so "Test Code", "test_code" and "TEST CODE" all
 * work. Cell values come back as trimmed text; blank rows are skipped.
 */
export async function readSheet<Key extends string>(
  buffer: Buffer,
  headers: Record<Key, string[]>,
  required: Key[]
): Promise<SheetRow<Key>[]> {
  const worksheet = await firstWorksheet(buffer);

  const lookup = new Map<string, Key>();
  for (const key of Object.keys(headers) as Key[]) {
    for (const spelling of headers[key]) lookup.set(normalizeHeader(spelling), key);
  }

  const columns = new Map<number, Key>();
  worksheet.getRow(1).eachCell((cell, colNumber) => {
    const key = lookup.get(normalizeHeader(cellText(cell.value)));
    if (key && ![...columns.values()].includes(key)) columns.set(colNumber, key);
  });
  const missing = required.filter((key) => ![...columns.values()].includes(key));
  if (missing.length > 0) {
    throw new ExcelParseError(
      `Missing required column(s): ${missing.map((key) => `"${headers[key][0]}"`).join(", ")}. Download the template for the exact columns.`
    );
  }

  const rows: SheetRow<Key>[] = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const values: Partial<Record<Key, string>> = {};
    let hasAnyValue = false;
    for (const [colNumber, key] of columns) {
      const text = cellText(row.getCell(colNumber).value).trim();
      if (text) {
        values[key] = text;
        hasAnyValue = true;
      }
    }
    if (hasAnyValue) rows.push({ rowNumber, values });
  }
  return rows;
}

/** A price cell that says the item isn't offered at that location. */
const NOT_OFFERED = ["na", "n/a", "-", "--", "notavailable", "unavailable", "no"];

type WideField = "price" | "tat" | "available";

/**
 * Reads the master-file layout: one row per item, with a column pair per
 * location side by side — "Dubai (TAT)", "Dubai (B2C) AED", "Bahrain (TAT)",
 * "Bahrain (B2C) BHD"… (also "Dubai Price (AED)", "Dubai TAT (max)"). Each
 * row is expanded into one row per location whose price cell is filled,
 * with `location`, `price`, `tat` and `available` set as in the one-row-per-
 * location layout, so the same import logic handles both. A price cell of
 * "NA", "-" or "Not available" becomes available = No with no price. A
 * price header that doesn't name a location ("KSA (B2C) SAR") belongs to the
 * TAT column next to it. "… sum of tests (reference)" columns are ignored.
 *
 * Returns null when the sheet has no per-location columns (the one-row-per-
 * location layout — use readSheet).
 */
export async function readWideSheet<Key extends string>(
  buffer: Buffer,
  headers: Record<Key, string[]>,
  required: Key[],
  locations: { name: string; code: string; currencyCode: string }[]
): Promise<SheetRow<Key | "location" | "price" | "tat" | "available">[] | null> {
  const worksheet = await firstWorksheet(buffer);

  const findLocation = (header: string) => {
    const words = header.toLowerCase().split(/[^a-z]+/);
    return locations.find((l) => words.includes(l.name.toLowerCase()) || words.includes(l.code.toLowerCase())) ?? null;
  };
  const fieldOf = (header: string): WideField | null => {
    const text = header.toLowerCase();
    if (/reference|sum of/.test(text)) return null;
    if (/\btat\b|turnaround/.test(text)) return "tat";
    if (/avail/.test(text)) return "available";
    if (/price|b2c|rate/.test(text) || locations.some((l) => new RegExp(`\\b${l.currencyCode.toLowerCase()}\\b`).test(text))) {
      return "price";
    }
    return null;
  };

  const headerCells: { col: number; text: string }[] = [];
  worksheet.getRow(1).eachCell((cell, col) => headerCells.push({ col, text: cellText(cell.value).trim() }));

  const wide = new Map<number, { field: WideField; location: (typeof locations)[number] | null }>();
  for (const { col, text } of headerCells) {
    const field = fieldOf(text);
    if (field) wide.set(col, { field, location: findLocation(text) });
  }
  if ([...wide.values()].filter((c) => c.location).length < 2) return null;
  // A price/TAT header with no location name takes its neighbour's.
  for (const [col, column] of wide) {
    if (column.location) continue;
    const neighbour = [wide.get(col - 1), wide.get(col + 1)].find((c) => c?.location && c.field !== column.field);
    if (neighbour) column.location = neighbour.location;
    else wide.delete(col);
  }

  const lookup = new Map<string, Key>();
  for (const key of Object.keys(headers) as Key[]) {
    for (const spelling of headers[key]) lookup.set(normalizeHeader(spelling), key);
  }
  const columns = new Map<number, Key>();
  for (const { col, text } of headerCells) {
    if (wide.has(col)) continue;
    const key = lookup.get(normalizeHeader(text));
    if (key && ![...columns.values()].includes(key)) columns.set(col, key);
  }
  const missing = required.filter((key) => ![...columns.values()].includes(key));
  if (missing.length > 0) {
    throw new ExcelParseError(
      `Missing required column(s): ${missing.map((key) => `"${headers[key][0]}"`).join(", ")}. Download the template for the exact columns.`
    );
  }

  const byLocation = new Map<string, { location: (typeof locations)[number]; cols: Partial<Record<WideField, number>> }>();
  for (const [col, { field, location }] of wide) {
    const entry = byLocation.get(location!.name) ?? { location: location!, cols: {} };
    entry.cols[field] ??= col;
    byLocation.set(location!.name, entry);
  }

  type Out = Key | "location" | "price" | "tat" | "available";
  const rows: SheetRow<Out>[] = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const base: Partial<Record<Out, string>> = {};
    for (const [col, key] of columns) {
      const text = cellText(row.getCell(col).value).trim();
      if (text) base[key] = text;
    }
    if (Object.keys(base).length === 0) continue;

    let expanded = 0;
    for (const { location, cols } of byLocation.values()) {
      const read = (field: WideField) => (cols[field] ? cellText(row.getCell(cols[field]!).value).trim() : "");
      const price = read("price");
      if (!price) continue;
      const notOffered = NOT_OFFERED.includes(price.toLowerCase().replace(/\s+/g, ""));
      const values: Partial<Record<Out, string>> = { ...base, location: location.name };
      if (!notOffered) values.price = price;
      if (read("tat")) values.tat = read("tat");
      const available = notOffered ? "No" : read("available");
      if (available) values.available = available;
      rows.push({ rowNumber, values });
      expanded++;
    }
    if (expanded === 0) rows.push({ rowNumber, values: base });
  }
  return rows;
}

async function firstWorksheet(buffer: Buffer): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch (error) {
    throw new ExcelParseError(`Could not read file as an Excel workbook: ${(error as Error).message}`);
  }
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new ExcelParseError("The workbook has no worksheets.");
  return worksheet;
}

function normalizeHeader(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Excel cell values can be rich text, formula results, hyperlinks or dates — flatten to text. */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("text" in value) return String(value.text);
    if ("result" in value) return cellText(value.result ?? null);
    return "";
  }
  return String(value);
}
