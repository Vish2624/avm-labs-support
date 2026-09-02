import "server-only";
import ExcelJS from "exceljs";
import { listAllTests } from "@/lib/database/tests";
import { listCurrentPricesWithTestInfo } from "@/lib/database/prices";
import { getLocationById } from "@/lib/database/locations";
import { SERVICE_TYPE_LABELS, type ServiceType } from "@/lib/constants/service-types";
import { getCurrencyFractionDigits } from "@/lib/pricing/money";

/** Build an .xlsx workbook of the full master test catalog — always from current database state, never from a past upload. */
export async function exportTestCatalog(): Promise<ExcelJS.Buffer> {
  const tests = await listAllTests();

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Tests");
  sheet.columns = [
    { header: "Test Code", key: "code", width: 14 },
    { header: "Test Name", key: "name", width: 34 },
    { header: "Short Name", key: "shortName", width: 14 },
    { header: "Category", key: "category", width: 18 },
    { header: "Description", key: "description", width: 40 },
    { header: "Active", key: "active", width: 10 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const test of tests) {
    sheet.addRow({
      code: test.code,
      name: test.officialName,
      shortName: test.shortName ?? "",
      category: test.category ?? "",
      description: test.description ?? "",
      active: test.active ? "Yes" : "No",
    });
  }

  return workbook.xlsx.writeBuffer();
}

/**
 * Build an .xlsx workbook of one location + service type's current price
 * list, using the same column schema the import pipeline reads (see
 * lib/excel/parse-excel.ts) — so this file round-trips through the import
 * pipeline unchanged if re-uploaded. Always from current test_prices state,
 * never from the last uploaded file.
 */
export async function exportPriceList(locationId: string, serviceType: ServiceType): Promise<ExcelJS.Buffer> {
  const location = await getLocationById(locationId);
  if (!location) throw new Error(`Unknown location: ${locationId}`);

  const prices = await listCurrentPricesWithTestInfo({ locationId, serviceType });
  const fractionDigits = getCurrencyFractionDigits(location.currencyCode);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Prices");
  sheet.columns = [
    { header: "Test Code", key: "testCode", width: 14 },
    { header: "Test Name", key: "testName", width: 34 },
    { header: "Category", key: "category", width: 18 },
    { header: "Price", key: "price", width: 12 },
    { header: "TAT", key: "tat", width: 18 },
    { header: "Service Type", key: "serviceType", width: 14 },
    { header: "Available", key: "available", width: 12 },
    { header: "Notes", key: "notes", width: 24 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const price of prices) {
    sheet.addRow({
      testCode: price.testCode,
      testName: price.testOfficialName,
      category: price.testCategory ?? "",
      price: price.price / 10 ** fractionDigits,
      tat: price.tatText,
      serviceType: price.serviceType,
      // The sheet's Available column is binary — temporarily_unavailable
      // (only settable via the Admin Availability page) collapses to "No"
      // here rather than being silently upgraded to "Yes".
      available: price.availability === "available" ? "Yes" : "No",
      notes: "",
    });
  }

  return workbook.xlsx.writeBuffer();
}

export function priceListFilename(locationCode: string, serviceType: ServiceType): string {
  const date = new Date().toISOString().slice(0, 10);
  return `${locationCode}-${SERVICE_TYPE_LABELS[serviceType].replace(/\s+/g, "")}-prices-${date}.xlsx`;
}
