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
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch (error) {
    throw new ExcelParseError(`Could not read file as an Excel workbook: ${(error as Error).message}`);
  }
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new ExcelParseError("The workbook has no worksheets.");

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
