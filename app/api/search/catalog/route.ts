import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/permissions";
import { loadSearchCatalog } from "@/lib/search/catalog/load-search-catalog";
import { isServiceType } from "@/lib/constants/service-types";
import { recordAppEvent } from "@/lib/database/app-events";

// The Quote search box's catalog for one location + service type (see
// lib/search/catalog/load-search-catalog.ts), searched in the browser on every
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

  try {
    const catalog = await loadSearchCatalog(locationId, serviceType);
    // Browsers may reuse it briefly; SWR refreshes it in the background.
    return NextResponse.json(catalog, { headers: { "Cache-Control": "private, max-age=30" } });
  } catch (error) {
    // Search can't work without it — worth an admin's attention.
    recordAppEvent({
      kind: "error",
      feature: "search",
      message: "Couldn't load the search catalog (tests and prices) for a location",
      detail: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Couldn't load the test list — please try again." }, { status: 500 });
  }
}
