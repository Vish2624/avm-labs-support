import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/permissions";
import { commitImport } from "@/lib/imports/commit-import";

// Confirms and activates a validated import (transactional — see
// activate_price_list_version in supabase/migrations).
export async function POST(request: NextRequest) {
  const user = await requireAdmin();
  const body = await request.json().catch(() => null);
  const versionId = body?.versionId;

  if (typeof versionId !== "string" || !versionId) {
    return NextResponse.json({ error: "versionId is required" }, { status: 400 });
  }

  try {
    const version = await commitImport(versionId, user.id);
    return NextResponse.json({ version });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
