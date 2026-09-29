import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/permissions";
import { searchTests } from "@/lib/search/catalog/search-tests";
import { suggestCorrection } from "@/lib/search/matching/suggest-correction";
import { isServiceType } from "@/lib/constants/service-types";

// Server-side test search. The Quote search box itself searches in the
// browser (/api/search/catalog + lib/search/catalog/search-catalog.ts); it only
// calls this when nothing matched, for the "Did you mean …?" suggestion.
export async function GET(request: NextRequest) {
  await requireUser();

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";
  const locationId = searchParams.get("locationId") ?? "";
  const serviceType = searchParams.get("serviceType") ?? "";

  if (!locationId) {
    return NextResponse.json({ error: "locationId is required" }, { status: 400 });
  }
  if (!isServiceType(serviceType)) {
    return NextResponse.json({ error: "serviceType must be in_house or outsource" }, { status: 400 });
  }

  const results = await searchTests(query, locationId, serviceType);
  // Nothing found: offer the closest real name as "Did you mean …?".
  const didYouMean = results.length === 0 ? await suggestCorrection(query) : null;
  return NextResponse.json({ results, didYouMean });
}
