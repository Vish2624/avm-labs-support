import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/permissions";
import { findMatchingProfiles } from "@/lib/profiles/find-matching-profiles";
import { searchProfilesByName } from "@/lib/profiles/search-profiles-by-name";
import { isServiceType } from "@/lib/constants/service-types";

// Profile matching endpoint, two modes:
// - testIds=<comma-separated test ids> -> rank by test overlap. Backs the
//   Support Workspace's profile-suggestions panel and /profiles' "search by
//   test names" mode (after chip resolution via /api/tests/resolve).
// - q=<free text> -> search by profile name/code. Backs /profiles' "search
//   by name" mode. Ignored if testIds is also present.
export async function GET(request: NextRequest) {
  await requireUser();

  const { searchParams } = new URL(request.url);
  const testIdsParam = searchParams.get("testIds") ?? "";
  const nameQuery = (searchParams.get("q") ?? "").trim();
  const locationId = searchParams.get("locationId") ?? "";
  const serviceType = searchParams.get("serviceType") ?? "";

  const testIds = testIdsParam
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (testIds.length === 0 && !nameQuery) {
    return NextResponse.json({ results: [] });
  }
  if (!locationId) {
    return NextResponse.json({ error: "locationId is required" }, { status: 400 });
  }
  if (!isServiceType(serviceType)) {
    return NextResponse.json({ error: "serviceType must be in_house or outsource" }, { status: 400 });
  }

  if (testIds.length > 0) {
    const results = await findMatchingProfiles(testIds, locationId, serviceType);
    return NextResponse.json({ results });
  }

  const results = await searchProfilesByName(nameQuery, locationId, serviceType);
  return NextResponse.json({ results });
}
