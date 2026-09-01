import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/permissions";
import { rollbackImport } from "@/lib/imports/rollback-import";

// Restores a previous archived version as active (transactional, recorded
// as a brand-new version — see rollback_price_list_version in
// supabase/migrations — so history stays append-only).
export async function POST(request: NextRequest) {
  const user = await requireAdmin();
  const body = await request.json().catch(() => null);
  const targetVersionId = body?.targetVersionId;

  if (typeof targetVersionId !== "string" || !targetVersionId) {
    return NextResponse.json({ error: "targetVersionId is required" }, { status: 400 });
  }

  try {
    const version = await rollbackImport(targetVersionId, user.id);
    return NextResponse.json({ version });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
