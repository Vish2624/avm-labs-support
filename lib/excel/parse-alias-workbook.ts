import "server-only";
import ExcelJS from "exceljs";
import { ExcelParseError } from "./parse-excel";

export interface AliasWorkbookRow {
  rowNumber: number;
  testCode: string;
  aliases: string[];
}

type ColumnKey = "testCode" | "aliases" | "shortName" | "fullForm";

// Header text -> canonical key. Headers are lowercased with anything in
// brackets or after "&" dropped, so "Aliases & Search Synonyms" and
// "Full Form (Clinical Name)" read as "aliases" / "full form".
const HEADER_KEYS: Record<string, ColumnKey> = {
  "test code": "testCode",
  code: "testCode",
  aliases: "aliases",
  alias: "aliases",
  synonyms: "aliases",
  "search synonyms": "aliases",
  "short name": "shortName",
  "full form": "fullForm",
  "full name": "fullForm",
  "clinical name": "fullForm",
};

function headerKey(text: string): ColumnKey | undefined {
  const cleaned = text
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .split("&")[0]
    .replace(/\s+/g, " ")
    .trim();
  return HEADER_KEYS[cleaned];
}

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
 * "Short Name" and "Full Form", each treated as one more alias). Structure only —
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
    const key = headerKey(cellText(cell.value));
    if (key && !columns.has(key)) columns.set(key, colNumber);
  });

  const codeColumn = columns.get("testCode");
  const aliasColumn = columns.get("aliases");
  if (!codeColumn || !aliasColumn) {
    throw new ExcelParseError('The first sheet needs a "Test Code" column and an "Aliases" column.');
  }
  const extraColumns = [columns.get("shortName"), columns.get("fullForm")].filter(
    (column): column is number => column !== undefined
  );

  const rows: AliasWorkbookRow[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const testCode = cellText(row.getCell(codeColumn).value).trim();
    if (!testCode) return;
    const aliases = cellText(row.getCell(aliasColumn).value)
      .split(ALIAS_SEPARATOR)
      .map((alias) => alias.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    for (const column of extraColumns) {
      const text = cellText(row.getCell(column).value).replace(/\s+/g, " ").trim();
      if (text) aliases.push(text);
    }
    rows.push({ rowNumber, testCode, aliases });
  });
  return rows;
}
