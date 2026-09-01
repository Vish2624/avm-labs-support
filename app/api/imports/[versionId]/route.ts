import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/permissions";
import { getPriceListVersion, listStagingRows } from "@/lib/database/imports";

// A single import version plus its staged rows (validation report detail +
// diff drill-down). Backs the Admin "Import History" page's detail view.
export async function GET(_request: Request, { params }: { params: Promise<{ versionId: string }> }) {
  await requireAdmin();
  const { versionId } = await params;

  const version = await getPriceListVersion(versionId);
  if (!version) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await listStagingRows(versionId);
  return NextResponse.json({ version, rows });
}
