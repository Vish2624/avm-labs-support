import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/permissions";
import { listPriceListVersions } from "@/lib/database/imports";
import { isServiceType } from "@/lib/constants/service-types";

// Import history, newest first — optionally filtered by location/service
// type. Backs the Admin "Import History" page.
export async function GET(request: NextRequest) {
  await requireAdmin();

  const { searchParams } = new URL(request.url);
  const locationId = searchParams.get("locationId") ?? undefined;
  const serviceTypeParam = searchParams.get("serviceType");
  const serviceType = serviceTypeParam && isServiceType(serviceTypeParam) ? serviceTypeParam : undefined;

  const versions = await listPriceListVersions({ locationId, serviceType });
  return NextResponse.json({ versions });
}
