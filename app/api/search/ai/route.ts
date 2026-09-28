import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/permissions";
import { geminiReaderConfigured } from "@/lib/ai/gemini";
import { aiSearchCatalog } from "@/lib/search/ai-read-message";
import { extractTests } from "@/lib/search/extract-tests";
import { SERVICE_TYPES, isServiceType } from "@/lib/constants/service-types";
import type { SemanticSearchItem } from "@/lib/search/semantic-search-results";

// The Quote search box's AI fallback (used when the rule-based search has
// no strong hit): Gemini picks catalog codes by meaning — "hair fall",
// "sugr tst", "test for tiredness" — then extractTests() prices them from
// the DB exactly like pasted text. Answers 501 without GEMINI_API_KEY, and
// the client then uses the free in-browser model instead.
export async function POST(request: NextRequest) {
  await requireUser();
  if (!geminiReaderConfigured("search")) {
    return NextResponse.json({ error: "Search AI is not configured" }, { status: 501 });
  }

  const body = (await request.json().catch(() => null)) as {
    q?: unknown;
    locationId?: unknown;
    serviceType?: unknown;
  } | null;
  const query = typeof body?.q === "string" ? body.q.trim().slice(0, 200) : "";
  const locationId = typeof body?.locationId === "string" ? body.locationId : "";
  const serviceType = typeof body?.serviceType === "string" ? body.serviceType : "";
  const serviceTypes = serviceType === "all" ? SERVICE_TYPES : isServiceType(serviceType) ? [serviceType] : null;
  if (!query || !locationId || !serviceTypes) {
    return NextResponse.json({ error: "q, locationId and serviceType are required" }, { status: 400 });
  }

  const codes = await aiSearchCatalog(query, locationId, serviceTypes).catch(() => null);
  if (codes === null) {
    return NextResponse.json({ error: "Search AI request failed" }, { status: 502 });
  }
  if (!codes) return NextResponse.json({ items: [] });

  const result = await extractTests(codes, locationId, serviceTypes);
  const items: SemanticSearchItem[] = [
    ...result.packages.map(({ result: pkg }) => ({ kind: "package" as const, confidence: "high" as const, result: pkg })),
    ...result.detected.map((test) => ({ kind: "test" as const, confidence: "high" as const, result: test })),
  ];
  return NextResponse.json({ items });
}
