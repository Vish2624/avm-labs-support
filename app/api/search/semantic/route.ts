import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/permissions";
import { priceSemanticMatches, type SemanticMatch } from "@/lib/search/semantic-search-results";
import { SERVICE_TYPES, isServiceType } from "@/lib/constants/service-types";

// A pasted message can send up to 3 candidates for each of ~20 unrecognised names.
const MAX_MATCHES = 60;

// Prices the items the in-browser semantic model picked for a Quote search.
// Only ids are trusted from the browser; every item is re-read from the
// catalog and priced from the DB (lib/search/semantic-search-results.ts).
// serviceType "all" prices tests in-house first, then outsourced, and lists
// in-house packages — the same as the rule-based "All" view.
export async function POST(request: NextRequest) {
  await requireUser();

  const body = (await request.json().catch(() => null)) as {
    matches?: unknown;
    locationId?: unknown;
    serviceType?: unknown;
  } | null;
  const locationId = typeof body?.locationId === "string" ? body.locationId : "";
  const serviceType = typeof body?.serviceType === "string" ? body.serviceType : "";
  const matches = (Array.isArray(body?.matches) ? body.matches : [])
    .filter(
      (match): match is SemanticMatch =>
        typeof match === "object" &&
        match !== null &&
        (match.kind === "test" || match.kind === "package") &&
        typeof match.id === "string" &&
        (match.confidence === "high" || match.confidence === "low")
    )
    .slice(0, MAX_MATCHES);

  if (!locationId) {
    return NextResponse.json({ error: "locationId is required" }, { status: 400 });
  }
  const testServiceTypes = serviceType === "all" ? SERVICE_TYPES : isServiceType(serviceType) ? [serviceType] : null;
  if (!testServiceTypes) {
    return NextResponse.json({ error: "serviceType must be all, in_house or outsource" }, { status: 400 });
  }

  const packageServiceType = serviceType === "all" ? "in_house" : testServiceTypes[0];
  const items = await priceSemanticMatches(matches, locationId, testServiceTypes, packageServiceType);
  return NextResponse.json({ items });
}
