import "server-only";
import ExcelJS from "exceljs";

/** Raw cell values keyed by AVM_PLAN.md's proposed price-list column names, read off row 1. */
export type RawPriceRow = Record<string, string | number | boolean | null>;

export interface ParsedExcelRow {
  rowNumber: number; // 1-based Excel row number, for error messages
  values: RawPriceRow;
}

/** Thrown when the workbook itself can't be read, or a required column is missing entirely. */
export class ExcelParseError extends Error {}

const REQUIRED_HEADERS = ["testCode", "testName", "price", "tat", "serviceType", "available"] as const;

const HEADER_ALIASES: Record<string, string> = {
  "test code": "testCode",
  code: "testCode",
  "test name": "testName",
  name: "testName",
  category: "category",
  price: "price",
  tat: "tat",
  "service type": "serviceType",
  available: "available",
  notes: "notes",
};

/**
 * Parse an uploaded .xlsx into raw row objects keyed by canonical column
 * name (header matching is case/whitespace-insensitive). Values are left
 * as-is (string/number/boolean) for validate-excel.ts's zod schema to
 * coerce and check — this step only concerns itself with structure, not
 * whether individual values are valid.
 */
export async function parseExcel(buffer: Buffer): Promise<ParsedExcelRow[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    // exceljs's own bundled @types/node version disagrees structurally with
    // this project's on the exact shape of Buffer (newer members like
    // maxByteLength) — a type-declaration mismatch, not a real type error.
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch (error) {
    throw new ExcelParseError(`Could not read file as an Excel workbook: ${(error as Error).message}`);
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new ExcelParseError("The workbook has no worksheets.");
  }

  const headerRow = worksheet.getRow(1);
  const columnKeys = new Map<number, string>();
  headerRow.eachCell((cell, colNumber) => {
    const normalized = normalizeHeader(cellText(cell.value));
    const key = HEADER_ALIASES[normalized];
    if (key) columnKeys.set(colNumber, key);
  });

  const missing = REQUIRED_HEADERS.filter((key) => ![...columnKeys.values()].includes(key));
  if (missing.length > 0) {
    throw new ExcelParseError(`Missing required column(s): ${missing.join(", ")}.`);
  }

  const rows: ParsedExcelRow[] = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const values: RawPriceRow = {};
    let hasAnyValue = false;

    for (const [colNumber, key] of columnKeys) {
      const value = cellPrimitive(row.getCell(colNumber).value);
      if (value !== null) hasAnyValue = true;
      values[key] = value;
    }

    if (hasAnyValue) rows.push({ rowNumber, values });
  }

  return rows;
}

function normalizeHeader(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Excel cell values can be rich text, formula results, or dates — flatten to a display string. */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((t) => t.text).join("");
    if ("text" in value) return String(value.text);
    if ("result" in value) return cellText(value.result ?? null);
  }
  return String(value);
}

function cellPrimitive(value: ExcelJS.CellValue): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "object") {
    if (value instanceof Date) return value.toISOString();
    if ("result" in value) return cellPrimitive(value.result ?? null);
  }
  const text = cellText(value).trim();
  return text === "" ? null : text;
}
