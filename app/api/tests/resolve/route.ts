import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/permissions";
import { resolveTestIds } from "@/lib/search/resolve-test-ids";

// Resolves free-text test names/codes/aliases to catalog test ids, for
// /profiles' "search by test names" chip mode. Unlike /api/search this
// isn't location/service-type scoped — a chip names a real catalog test
// regardless of whether it's currently priced anywhere.
export async function GET(request: NextRequest) {
  await requireUser();

  const { searchParams } = new URL(request.url);
  const namesParam = searchParams.get("names") ?? "";
  const queries = namesParam
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  if (queries.length === 0) {
    return NextResponse.json({ results: [] });
  }

  const results = await resolveTestIds(queries);
  return NextResponse.json({ results });
}
