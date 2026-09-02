import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/permissions";
import { exportTestCatalog, exportPriceList, priceListFilename } from "@/lib/excel/export-excel";
import { getLocationById } from "@/lib/database/locations";
import { recordAuditLog } from "@/lib/database/audit-log";
import { isServiceType } from "@/lib/constants/service-types";

// Export current active database state as .xlsx — always built fresh from
// the database (see lib/excel/export-excel.ts), never from a past upload.
export async function GET(request: NextRequest) {
  const user = await requireAdmin();

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");

  if (type === "tests") {
    const buffer = await exportTestCatalog();
    await recordAuditLog({ userId: user.id, action: "export_tests", entity: "tests" });
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="test-catalog.xlsx"`,
      },
    });
  }

  if (type === "prices") {
    const locationId = searchParams.get("locationId") ?? "";
    const serviceType = searchParams.get("serviceType") ?? "";

    if (!locationId) return NextResponse.json({ error: "locationId is required" }, { status: 400 });
    if (!isServiceType(serviceType)) {
      return NextResponse.json({ error: "serviceType must be in_house or outsource" }, { status: 400 });
    }

    const location = await getLocationById(locationId);
    if (!location) return NextResponse.json({ error: "Unknown location" }, { status: 400 });

    const buffer = await exportPriceList(locationId, serviceType);
    await recordAuditLog({
      userId: user.id,
      action: "export_prices",
      entity: "test_prices",
      newValue: { locationId, serviceType },
    });
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${priceListFilename(location.code, serviceType)}"`,
      },
    });
  }

  return NextResponse.json({ error: "type must be 'tests' or 'prices'" }, { status: 400 });
}
