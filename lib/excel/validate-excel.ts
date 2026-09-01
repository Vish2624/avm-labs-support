import { priceRowSchema, type PriceRowInput } from "@/lib/validation/price-schema";
import type { RawPriceRow, ParsedExcelRow } from "./parse-excel";
import type { ImportRowIssue } from "@/types/import";
import type { ServiceType } from "@/lib/constants/service-types";

export interface RowValidationResult {
  rowNumber: number;
  raw: RawPriceRow;
  /** null when the row has any error (schema, service-type mismatch, or duplicate code). */
  value: PriceRowInput | null;
  issues: ImportRowIssue[];
}

/**
 * Applies the zod row schema plus cross-row rules — duplicate test code,
 * and the row's Service Type column must match the service type selected
 * for this upload — to every parsed row. Pure, no DB access: catalog/price
 * context (new-test and price-change detection) are separate functions
 * since they need data this function isn't given.
 */
export function validateExcel(rows: ParsedExcelRow[], expectedServiceType: ServiceType): RowValidationResult[] {
  const seenCodes = new Set<string>();
  const results: RowValidationResult[] = [];

  for (const { rowNumber, values } of rows) {
    const issues: ImportRowIssue[] = [];
    const parsed = priceRowSchema.safeParse(values);

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        issues.push({ row: rowNumber, field: String(issue.path[0] ?? "row"), severity: "error", message: issue.message });
      }
      results.push({ rowNumber, raw: values, value: null, issues });
      continue;
    }

    const value = parsed.data;

    if (value.serviceType !== expectedServiceType) {
      issues.push({
        row: rowNumber,
        field: "serviceType",
        severity: "error",
        message: `Row is marked "${value.serviceType}" but this upload is for "${expectedServiceType}".`,
      });
    }

    const codeKey = value.testCode.trim().toUpperCase();
    if (seenCodes.has(codeKey)) {
      issues.push({
        row: rowNumber,
        field: "testCode",
        severity: "error",
        message: `Duplicate Test Code "${value.testCode}" — already appears earlier in this file.`,
      });
    }
    seenCodes.add(codeKey);

    results.push({ rowNumber, raw: values, value: issues.length === 0 ? value : null, issues });
  }

  return results;
}
