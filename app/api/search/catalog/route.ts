import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/permissions";
import { listActiveTests } from "@/lib/database/tests";
import { listActiveAliases } from "@/lib/database/aliases";
import { browseProfiles, browseTests } from "@/lib/search/browse-catalog";
import { isServiceType } from "@/lib/constants/service-types";
import type { SearchCatalog } from "@/lib/search/search-catalog";

// The Quote search box's catalog for one location + service type — every
// active test and alias (to match against) plus the tests and profiles
// priced here — sent once so the browser searches it locally on every
// keystroke (lib/search/search-catalog.ts). All from the server's cached
// catalog snapshot, so this is quick; prices are real current DB rows.
export async function GET(request: NextRequest) {
  await requireUser();

  const { searchParams } = new URL(request.url);
  const locationId = searchParams.get("locationId") ?? "";
  const serviceType = searchParams.get("serviceType") ?? "";
  if (!locationId || !isServiceType(serviceType)) {
    return NextResponse.json({ error: "locationId and serviceType (in_house or outsource) are required" }, { status: 400 });
  }

  const [tests, aliases, priced, profiles] = await Promise.all([
    listActiveTests(),
    listActiveAliases(),
    browseTests(locationId, serviceType),
    browseProfiles(locationId, serviceType),
  ]);

  const catalog: SearchCatalog = {
    // Only the fields matching reads — keeps the download small.
    tests: tests.map(({ id, code, officialName, shortName }) => ({ id, code, officialName, shortName })),
    aliases: aliases.map(({ testId, alias, normalizedAlias, confidence }) => ({ testId, alias, normalizedAlias, confidence })),
    priced,
    profiles,
  };
  // Browsers may reuse it briefly; SWR refreshes it in the background.
  return NextResponse.json(catalog, { headers: { "Cache-Control": "private, max-age=30" } });
}
