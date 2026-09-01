import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/permissions";
import { createImport } from "@/lib/imports/create-import";
import { validateImport } from "@/lib/imports/validate-import";
import { isServiceType } from "@/lib/constants/service-types";

// Uploads a price list Excel file: creates a staging version, parses and
// validates it, persists every row to price_list_staging_rows, and returns
// the validation report + before/after diff preview. Never touches live
// test_prices data either way — see /api/imports/confirm for activation.
export async function POST(request: NextRequest) {
  const user = await requireAdmin();

  const formData = await request.formData();
  const file = formData.get("file");
  const locationId = String(formData.get("locationId") ?? "");
  const serviceType = String(formData.get("serviceType") ?? "");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (!locationId) {
    return NextResponse.json({ error: "locationId is required" }, { status: 400 });
  }
  if (!isServiceType(serviceType)) {
    return NextResponse.json({ error: "serviceType must be in_house or outsource" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const version = await createImport({
    locationId,
    serviceType,
    originalFilename: file.name,
    fileSize: buffer.byteLength,
    createdBy: user.id,
  });

  const { report, diff } = await validateImport({
    versionId: version.id,
    fileBuffer: buffer,
    locationId,
    serviceType,
  });

  return NextResponse.json({ versionId: version.id, versionNumber: version.versionNumber, report, diff });
}
