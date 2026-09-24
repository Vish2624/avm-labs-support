import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/permissions";
import { aiSearchResults } from "@/lib/search/ai-search-results";
import { isAiSearchEnabled } from "@/lib/search/ai-search";
import { SERVICE_TYPES, isServiceType } from "@/lib/constants/service-types";

// Semantic fallback for the Quote search box (lib/search/ai-search.ts),
// called by the workspace only when the rule-based search found nothing
// strong. serviceType "all" prices tests in-house first, then outsourced,
// and lists in-house packages — the same as the rule-based "All" view.
export async function GET(request: NextRequest) {
  await requireUser();

  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "").trim();
  const locationId = searchParams.get("locationId") ?? "";
  const serviceType = searchParams.get("serviceType") ?? "";

  if (!isAiSearchEnabled()) {
    return NextResponse.json({ enabled: false, correctedQuery: null, items: [] });
  }
  if (!locationId) {
    return NextResponse.json({ error: "locationId is required" }, { status: 400 });
  }
  const testServiceTypes = serviceType === "all" ? SERVICE_TYPES : isServiceType(serviceType) ? [serviceType] : null;
  if (!testServiceTypes) {
    return NextResponse.json({ error: "serviceType must be all, in_house or outsource" }, { status: 400 });
  }
  if (query.length < 2 || query.length > 200) {
    return NextResponse.json({ enabled: true, correctedQuery: null, items: [] });
  }

  const packageServiceType = serviceType === "all" ? "in_house" : testServiceTypes[0];
  const response = await aiSearchResults(query, locationId, testServiceTypes, packageServiceType);
  return NextResponse.json({ enabled: true, correctedQuery: response?.correctedQuery ?? null, items: response?.items ?? [] });
}
