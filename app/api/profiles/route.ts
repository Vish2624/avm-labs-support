import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/permissions";
import { findMatchingProfiles } from "@/lib/profiles/find-matching-profiles";
import { isServiceType } from "@/lib/constants/service-types";

// Profile matching endpoint. Currently backs the Support Workspace's
// profile-suggestions panel (rank by overlap with the selected test ids —
// pass testIds). /profiles' additional "search by name" mode is Phase 5.
export async function GET(request: NextRequest) {
  await requireUser();

  const { searchParams } = new URL(request.url);
  const testIdsParam = searchParams.get("testIds") ?? "";
  const locationId = searchParams.get("locationId") ?? "";
  const serviceType = searchParams.get("serviceType") ?? "";

  const testIds = testIdsParam
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (testIds.length === 0) {
    return NextResponse.json({ results: [] });
  }
  if (!locationId) {
    return NextResponse.json({ error: "locationId is required" }, { status: 400 });
  }
  if (!isServiceType(serviceType)) {
    return NextResponse.json({ error: "serviceType must be in_house or outsource" }, { status: 400 });
  }

  const results = await findMatchingProfiles(testIds, locationId, serviceType);
  return NextResponse.json({ results });
}
