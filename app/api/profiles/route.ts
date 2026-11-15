import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/permissions";
import { findMatchingProfiles } from "@/lib/profiles/find-matching-profiles";
import { findWebsiteSuggestions } from "@/lib/profiles/find-website-suggestions";
import { searchProfilesByName } from "@/lib/profiles/search-profiles-by-name";
import { browseProfiles } from "@/lib/search/catalog/browse-catalog";
import { isServiceType } from "@/lib/constants/service-types";

const idList = (value: string | null) =>
  (value ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

// Profile matching endpoint, four modes:
// - suggest=1&testIds=…&profileIds=… -> the Quote's profile suggestions, by
//   the website's rules (lib/profiles/website-suggestions.ts), for the tests
//   and profiles on the quote. No serviceType: profiles are In-House.
// - testIds=<comma-separated test ids> -> rank by test overlap. Backs
//   /profiles' "search by test names" mode (after chip resolution via
//   /api/tests/resolve).
// - q=<free text> -> search by profile name/code. Backs /profiles' "search
//   by name" mode. Ignored if testIds is also present.
// - browse=1 (no q/testIds) -> every profile and package priced here, A–Z:
//   what /profiles lists before anything is typed.
export async function GET(request: NextRequest) {
  await requireUser();

  const { searchParams } = new URL(request.url);
  const nameQuery = (searchParams.get("q") ?? "").trim();
  const browse = searchParams.get("browse") === "1";
  const suggest = searchParams.get("suggest") === "1";
  const locationId = searchParams.get("locationId") ?? "";
  const serviceType = searchParams.get("serviceType") ?? "";
  const testIds = idList(searchParams.get("testIds"));
  const profileIds = idList(searchParams.get("profileIds"));

  if (testIds.length === 0 && profileIds.length === 0 && !nameQuery && !browse) {
    return NextResponse.json({ results: [] });
  }
  if (!locationId) {
    return NextResponse.json({ error: "locationId is required" }, { status: 400 });
  }

  if (suggest) {
    const results = await findWebsiteSuggestions(testIds, profileIds, locationId);
    return NextResponse.json({ results });
  }

  if (!isServiceType(serviceType)) {
    return NextResponse.json({ error: "serviceType must be in_house or outsource" }, { status: 400 });
  }

  if (testIds.length > 0) {
    const results = await findMatchingProfiles(testIds, locationId, serviceType);
    return NextResponse.json({ results });
  }

  const results = nameQuery
    ? await searchProfilesByName(nameQuery, locationId, serviceType)
    : await browseProfiles(locationId, serviceType);
  return NextResponse.json({ results });
}
