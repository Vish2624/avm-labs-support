import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/permissions";
import { searchTests } from "@/lib/search/search-tests";
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

  const results = await searchTests(query, locationId, serviceType);
  return NextResponse.json({ results });
}
