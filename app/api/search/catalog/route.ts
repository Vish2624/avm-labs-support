import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/permissions";
import { loadSearchCatalog } from "@/lib/search/load-search-catalog";
import { isServiceType } from "@/lib/constants/service-types";

// The Quote search box's catalog for one location + service type (see
// lib/search/load-search-catalog.ts), searched in the browser on every
// keystroke. The Quote page renders the current location's catalog into
// the page itself; this serves location/service-type switches and the
// background refresh.
export async function GET(request: NextRequest) {
  await requireUser();

  const { searchParams } = new URL(request.url);
  const locationId = searchParams.get("locationId") ?? "";
  const serviceType = searchParams.get("serviceType") ?? "";
  if (!locationId || !isServiceType(serviceType)) {
    return NextResponse.json({ error: "locationId and serviceType (in_house or outsource) are required" }, { status: 400 });
  }

  const catalog = await loadSearchCatalog(locationId, serviceType);
  // Browsers may reuse it briefly; SWR refreshes it in the background.
  return NextResponse.json(catalog, { headers: { "Cache-Control": "private, max-age=30" } });
}
