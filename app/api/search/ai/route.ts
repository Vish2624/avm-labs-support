import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/permissions";
import { geminiReaderConfigured } from "@/lib/ai/gemini";
import { aiSearchCatalog } from "@/lib/search/reading/ai-read-message";
import { extractTests } from "@/lib/search/reading/extract-tests";
import { isPackageName } from "@/lib/search/matching/is-package-name";
import { SERVICE_TYPES, isServiceType } from "@/lib/constants/service-types";

// The Quote search box's second step: only asked when the fuzzy search
// found nothing. Gemini picks catalog codes by meaning ("hair fall",
// "test for tiredness") from tests and profiles — never packages — and
// extractTests() prices them from the DB, so every price is a real record.
// Answers 501 without a Gemini key (the search then just shows "no match").
export async function GET(request: NextRequest) {
  await requireUser();
  if (!geminiReaderConfigured("search")) {
    return NextResponse.json({ error: "Search AI is not configured" }, { status: 501 });
  }

  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "").trim().slice(0, 200);
  const locationId = searchParams.get("locationId") ?? "";
  const serviceType = searchParams.get("serviceType") ?? "";
  const serviceTypes = serviceType === "all" ? SERVICE_TYPES : isServiceType(serviceType) ? [serviceType] : null;
  if (!query || !locationId || !serviceTypes) {
    return NextResponse.json({ error: "q, locationId and serviceType are required" }, { status: 400 });
  }

  const codes = await aiSearchCatalog(query, locationId, serviceTypes, false).catch(() => null);
  if (codes === null) {
    return NextResponse.json({ error: "Search AI request failed" }, { status: 502 });
  }
  if (!codes) return NextResponse.json({ tests: [], profiles: [] });

  const result = await extractTests(codes, locationId, serviceTypes);
  return NextResponse.json({
    tests: result.detected,
    profiles: result.packages.map(({ result: profile }) => profile).filter((profile) => !isPackageName(profile.name)),
  });
}
