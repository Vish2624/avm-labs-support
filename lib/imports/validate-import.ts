import "server-only";
import { parseExcel, ExcelParseError } from "@/lib/excel/parse-excel";
import { validateExcel } from "@/lib/excel/validate-excel";
import { detectNewTests } from "@/lib/excel/detect-new-tests";
import { detectChanges, isLargePriceChange, type CurrentPriceSnapshot } from "@/lib/excel/detect-changes";
import { transformExcel } from "@/lib/excel/transform-excel";
import { listActiveTests, getTestsByIds } from "@/lib/database/tests";
import { getCurrentPrices } from "@/lib/database/prices";
import { getLocationById } from "@/lib/database/locations";
import { getActivePriceListVersion, insertStagingRows, updatePriceListVersion } from "@/lib/database/imports";
import type { ServiceType } from "@/lib/constants/service-types";
import type { ImportRowIssue, ImportValidationReport, ImportDiff, ParsedPriceRow } from "@/types/import";

/** Below this magnitude, a row-count change vs. the last active version isn't worth flagging. */
const ROW_COUNT_CHANGE_THRESHOLD_PERCENT = 20;

export interface ValidateImportInput {
  versionId: string;
  fileBuffer: Buffer;
  locationId: string;
  serviceType: ServiceType;
}

export interface ValidateImportResult {
  report: ImportValidationReport;
  diff: ImportDiff;
}

/**
 * Runs full validation for a staged import: parses the file, applies the
 * row schema + cross-row rules, flags new tests and large price changes as
 * warnings, persists every row to price_list_staging_rows, and moves the
 * version to 'validated' (clean, possibly with warnings) or 'failed' (any
 * error) — never touching live test_prices data either way. Only a
 * 'validated' version can later be activated (see lib/imports/commit-import.ts).
 */
export async function validateImport(input: ValidateImportInput): Promise<ValidateImportResult> {
  const { versionId, locationId, serviceType } = input;

  let rawRows;
  try {
    rawRows = await parseExcel(input.fileBuffer);
  } catch (error) {
    if (!(error instanceof ExcelParseError)) throw error;

    const issue: ImportRowIssue = { row: 0, field: "file", severity: "error", message: error.message };
    await insertStagingRows(versionId, [
      { rowNumber: 0, rawRow: {}, parsed: null, rowStatus: "error", errorMessages: [issue] },
    ]);
    await updatePriceListVersion(versionId, { status: "failed", recordCount: 0, validatedAt: new Date().toISOString() });

    return {
      report: { versionId, rowCount: 0, errorCount: 1, warningCount: 0, issues: [issue] },
      diff: { newTestCount: 0, newPriceCount: 0, changedCount: 0, unchangedCount: 0, rows: [] },
    };
  }

  const [location, existingTests, activeVersion] = await Promise.all([
    getLocationById(locationId),
    listActiveTests(),
    getActivePriceListVersion(locationId, serviceType),
  ]);
  if (!location) throw new Error(`Unknown location: ${locationId}`);

  const rowResults = validateExcel(rawRows, serviceType);
  const validRows = rowResults.filter((result) => result.value !== null);
  const existingCodes = new Set(existingTests.map((test) => test.code));
  const newTestCodes = detectNewTests(
    validRows.map((result) => result.value!),
    existingCodes
  );

  const parsedByRowNumber = new Map<number, ParsedPriceRow>();
  for (const result of validRows) {
    const parsed = transformExcel(result.value!, result.rowNumber, location.currencyCode, newTestCodes.has(result.value!.testCode));
    parsedByRowNumber.set(result.rowNumber, parsed);
  }
  const parsedRows = [...parsedByRowNumber.values()];

  // Current prices for exactly the existing tests this file references.
  const existingTestIdByCode = new Map(existingTests.map((test) => [test.code, test.id]));
  const relevantTestIds = parsedRows
    .filter((row) => !row.isNewTest)
    .map((row) => existingTestIdByCode.get(row.testCode))
    .filter((id): id is string => Boolean(id));
  const currentPrices = await getCurrentPrices(relevantTestIds, locationId, serviceType);
  const testsById = new Map((await getTestsByIds(relevantTestIds)).map((test) => [test.id, test]));
  const currentPricesByCode = new Map<string, CurrentPriceSnapshot>(
    currentPrices
      .map((price) => {
        const code = testsById.get(price.testId)?.code;
        return code
          ? ([code.trim().toUpperCase(), { price: price.price, currencyCode: price.currencyCode, tatText: price.tatText, availability: price.availability }] as const)
          : null;
      })
      .filter((entry): entry is [string, CurrentPriceSnapshot] => entry !== null)
  );

  const diff = detectChanges(parsedRows, currentPricesByCode, location.currencyCode);
  const diffByCode = new Map(diff.rows.map((row) => [row.testCode, row]));

  const issuesByRowNumber = new Map<number, ImportRowIssue[]>();
  for (const result of rowResults) {
    const issues = [...result.issues];
    if (result.value) {
      if (newTestCodes.has(result.value.testCode)) {
        issues.push({
          row: result.rowNumber,
          field: "testCode",
          severity: "warning",
          message: `"${result.value.testCode}" isn't in the catalog yet — it will be created on activation.`,
        });
      }
      const diffRow = diffByCode.get(result.value.testCode);
      if (diffRow && isLargePriceChange(diffRow.priceChangePercent)) {
        const sign = diffRow.priceChangePercent! > 0 ? "+" : "";
        issues.push({
          row: result.rowNumber,
          field: "price",
          severity: "warning",
          message: `Large price change: ${sign}${diffRow.priceChangePercent}%.`,
        });
      }
    }
    issuesByRowNumber.set(result.rowNumber, issues);
  }

  const reportIssues = [...issuesByRowNumber.values()].flat();

  if (activeVersion?.recordCount) {
    const delta = Math.round(((rawRows.length - activeVersion.recordCount) / activeVersion.recordCount) * 100);
    if (Math.abs(delta) >= ROW_COUNT_CHANGE_THRESHOLD_PERCENT) {
      reportIssues.push({
        row: 0,
        field: "file",
        severity: "warning",
        message: `This file has ${rawRows.length} rows vs. ${activeVersion.recordCount} in the currently active version (${delta > 0 ? "+" : ""}${delta}%).`,
      });
    }
  }

  await insertStagingRows(
    versionId,
    rowResults.map((result) => ({
      rowNumber: result.rowNumber,
      rawRow: result.raw,
      parsed: parsedByRowNumber.get(result.rowNumber) ?? null,
      rowStatus: issueSeverityStatus(issuesByRowNumber.get(result.rowNumber) ?? []),
      errorMessages: issuesByRowNumber.get(result.rowNumber) ?? [],
    }))
  );

  const errorCount = reportIssues.filter((issue) => issue.severity === "error").length;
  const warningCount = reportIssues.filter((issue) => issue.severity === "warning").length;

  await updatePriceListVersion(versionId, {
    status: errorCount > 0 ? "failed" : "validated",
    recordCount: rawRows.length,
    validatedAt: new Date().toISOString(),
  });

  return {
    report: { versionId, rowCount: rawRows.length, errorCount, warningCount, issues: reportIssues },
    diff,
  };
}

function issueSeverityStatus(issues: ImportRowIssue[]): "ok" | "error" | "warning" {
  if (issues.some((issue) => issue.severity === "error")) return "error";
  if (issues.length > 0) return "warning";
  return "ok";
}
