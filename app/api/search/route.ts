import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/permissions";
import { queryNamesSeveralTests, searchTests } from "@/lib/search/search-tests";
import { suggestCorrection } from "@/lib/search/suggest-correction";
import { browseTests } from "@/lib/search/browse-catalog";
import { isServiceType } from "@/lib/constants/service-types";

// Test search endpoint backing the Support Workspace's live search box.
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

  // browse=1 with no query: the full priced list for this service type.
  if (searchParams.get("browse") === "1" && !query.trim()) {
    return NextResponse.json({ results: await browseTests(locationId, serviceType), isList: false, didYouMean: null });
  }

  const [results, isList] = await Promise.all([
    searchTests(query, locationId, serviceType),
    queryNamesSeveralTests(query),
  ]);
  // Nothing found: offer the closest real name as "Did you mean …?".
  const didYouMean = results.length === 0 && !isList ? await suggestCorrection(query) : null;
  return NextResponse.json({ results, isList, didYouMean });
}
