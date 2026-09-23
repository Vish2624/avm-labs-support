import "server-only";
import ExcelJS from "exceljs";
import { ExcelParseError } from "./parse-excel";

export interface AliasWorkbookRow {
  rowNumber: number;
  testCode: string;
  aliases: string[];
}

// Header text -> canonical key (case/whitespace-insensitive).
const HEADER_KEYS: Record<string, "testCode" | "aliases" | "shortName"> = {
  "test code": "testCode",
  code: "testCode",
  aliases: "aliases",
  alias: "aliases",
  "short name": "shortName",
};

// Aliases in one cell are comma-separated; also accept ; | and new lines.
const ALIAS_SEPARATOR = /[,;|\n]+/;

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("text" in value) return String(value.text);
    if ("result" in value) return String(value.result ?? "");
    return "";
  }
  return String(value);
}

/**
 * Reads a test-catalog workbook's "Test Code" + "Aliases" columns (plus
 * "Short Name", which is treated as one more alias). Structure only —
 * matching codes to catalog tests and de-duplicating happens in
 * lib/imports/import-aliases.ts.
 */
export async function parseAliasWorkbook(buffer: Buffer): Promise<AliasWorkbookRow[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch (error) {
    throw new ExcelParseError(`Could not read file as an Excel workbook: ${(error as Error).message}`);
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new ExcelParseError("The workbook has no worksheets.");

  const columns = new Map<string, number>();
  worksheet.getRow(1).eachCell((cell, colNumber) => {
    const key = HEADER_KEYS[cellText(cell.value).trim().toLowerCase().replace(/\s+/g, " ")];
    if (key && !columns.has(key)) columns.set(key, colNumber);
  });

  const codeColumn = columns.get("testCode");
  const aliasColumn = columns.get("aliases");
  if (!codeColumn || !aliasColumn) {
    throw new ExcelParseError('The first sheet needs a "Test Code" column and an "Aliases" column.');
  }
  const shortNameColumn = columns.get("shortName");

  const rows: AliasWorkbookRow[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const testCode = cellText(row.getCell(codeColumn).value).trim();
    if (!testCode) return;
    const aliases = cellText(row.getCell(aliasColumn).value)
      .split(ALIAS_SEPARATOR)
      .map((alias) => alias.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    if (shortNameColumn) {
      const shortName = cellText(row.getCell(shortNameColumn).value).replace(/\s+/g, " ").trim();
      if (shortName) aliases.push(shortName);
    }
    rows.push({ rowNumber, testCode, aliases });
  });
  return rows;
}
